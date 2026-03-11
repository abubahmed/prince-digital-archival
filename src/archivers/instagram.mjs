import { eq, desc } from "drizzle-orm";
import db from "../db/client.mjs";
import { instagramPosts, failedItems } from "../db/schema.mjs";
import { fetchInstagramPosts } from "../fetchers/instagram.mjs";
import { downloadVideo } from "../media/download.mjs";
import { imagesToPdf } from "../media/pdf.mjs";
import { upload, buildKey } from "../s3/client.mjs";
import logger from "../util/logger.mjs";

const BATCH_SIZE = 50;

async function downloadMedia(item) {
  if (item.type === "Video" && item.videoUrl) {
    return { buffer: await downloadVideo(item.videoUrl), ext: "mp4" };
  }

  if (item.type === "Sidecar" && item.images?.length) {
    return { buffer: await imagesToPdf(item.images), ext: "pdf" };
  }

  if (item.type === "Image" && item.displayUrl) {
    return { buffer: await imagesToPdf([item.displayUrl]), ext: "pdf" };
  }

  return null;
}

async function archiveInstagramBatch(items) {
  let archived = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const existing = await db.select({ id: instagramPosts.id })
        .from(instagramPosts)
        .where(eq(instagramPosts.id, String(item.id)))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      let s3Key = null;
      try {
        const media = await downloadMedia(item);
        if (media) {
          const filename = `media.${media.ext}`;
          s3Key = buildKey("instagram", item.timestamp, item.id, filename);
          await upload(s3Key, media.buffer);
        } else {
          logger.warn(`No media for Instagram post ${item.id}, archiving without media`);
        }
      } catch (mediaErr) {
        logger.warn(`Media failed for Instagram post ${item.id}: ${mediaErr.message}, archiving without media`);
      }

      await db.insert(instagramPosts).values({
        id: String(item.id),
        timestamp: new Date(item.timestamp),
        url: item.url,
        caption: item.caption || null,
        s3_key: s3Key,
        metadata: item,
      });

      archived++;
      logger.info(`Archived Instagram post ${item.id} (${item.type})`);
    } catch (err) {
      failed++;
      logger.error(`Failed to archive Instagram post ${item.id}: ${err.message}`);

      await db.insert(failedItems).values({
        source: "instagram",
        error: err.message,
        rawData: item,
      }).catch((e) => logger.error(`Failed to log failure: ${e.message}`));
    }
  }

  return { archived, skipped, failed };
}

export async function archiveInstagram(since) {
  // resume from last archived post if possible
  const latest = await db.select({ timestamp: instagramPosts.timestamp })
    .from(instagramPosts)
    .orderBy(desc(instagramPosts.timestamp))
    .limit(1);

  if (latest.length > 0 && latest[0].timestamp > since) {
    const resumeFrom = new Date(latest[0].timestamp);
    resumeFrom.setMonth(resumeFrom.getMonth() - 1);
    if (resumeFrom > since) since = resumeFrom;
    logger.info(`Resuming from ${since.toISOString().slice(0, 10)} (last archived: ${latest[0].timestamp.toISOString().slice(0, 10)})`);
  }

  // single fetch — instagram API only supports "newer than"
  const items = await fetchInstagramPosts(since);
  if (!items || items.length === 0) {
    logger.info("No Instagram posts to archive");
    return;
  }

  logger.info(`Processing ${items.length} Instagram posts in batches of ${BATCH_SIZE}`);

  let totalArchived = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);
    const pct = Math.round((batchNum / totalBatches) * 100);

    const { archived, skipped, failed } = await archiveInstagramBatch(batch);
    totalArchived += archived;
    totalSkipped += skipped;
    totalFailed += failed;

    const filled = Math.round(pct / 5);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    logger.info(`[${bar}] ${pct}% (${batchNum}/${totalBatches}) | ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
  }

  logger.success(`Instagram done: ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
}
