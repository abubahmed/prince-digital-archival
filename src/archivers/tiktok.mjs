import { eq, desc } from "drizzle-orm";
import db from "../db/client.mjs";
import { tiktokPosts, failedItems } from "../db/schema.mjs";
import { fetchTiktokPosts } from "../fetchers/tiktok.mjs";
import { downloadVideo } from "../media/download.mjs";
import { imagesToPdf } from "../media/pdf.mjs";
import { upload, buildKey } from "../s3/client.mjs";
import { splitByMonth } from "../util/dates.mjs";
import logger from "../util/logger.mjs";

async function downloadMedia(item) {
  // slideshow — multiple images
  if (item.mediaUrls?.length) {
    return { buffer: await imagesToPdf(item.mediaUrls), ext: "pdf" };
  }

  // single video
  const videoUrl = item.videoMeta?.downloadAddr;
  if (videoUrl) {
    return { buffer: await downloadVideo(videoUrl), ext: "mp4" };
  }

  return null;
}

async function archiveTiktokBatch(items) {
  let archived = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const existing = await db.select({ id: tiktokPosts.id })
        .from(tiktokPosts)
        .where(eq(tiktokPosts.id, String(item.id)))
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
          s3Key = buildKey("tiktok", item.createTimeISO, item.id, filename);
          await upload(s3Key, media.buffer);
        } else {
          logger.warn(`No media for TikTok post ${item.id}, archiving without media`);
        }
      } catch (mediaErr) {
        logger.warn(`Media failed for TikTok post ${item.id}: ${mediaErr.message}, archiving without media`);
      }

      await db.insert(tiktokPosts).values({
        id: String(item.id),
        timestamp: new Date(item.createTimeISO),
        url: `https://www.tiktok.com/@thedailyprincetonian/video/${item.id}`,
        caption: item.text || null,
        s3_key: s3Key,
        metadata: item,
      });

      archived++;
      logger.info(`Archived TikTok post ${item.id}`);
    } catch (err) {
      failed++;
      logger.error(`Failed to archive TikTok post ${item.id}: ${err.message}`);

      await db.insert(failedItems).values({
        source: "tiktok",
        error: err.message,
        rawData: item,
      }).catch((e) => logger.error(`Failed to log failure: ${e.message}`));
    }
  }

  return { archived, skipped, failed };
}

export async function archiveTiktok(start, end) {
  const intervals = splitByMonth(start, end);

  // resume from last archived post
  const latest = await db.select({ timestamp: tiktokPosts.timestamp })
    .from(tiktokPosts)
    .orderBy(desc(tiktokPosts.timestamp))
    .limit(1);

  let resumeIdx = 0;
  if (latest.length > 0 && latest[0].timestamp > start) {
    const lastArchived = latest[0].timestamp;
    const matchIdx = intervals.findIndex((iv) => lastArchived >= iv.start && lastArchived <= iv.end);
    if (matchIdx > 0) {
      resumeIdx = matchIdx - 1;
      logger.info(`Resuming from interval ${resumeIdx + 1}/${intervals.length} (last archived: ${lastArchived.toISOString().slice(0, 10)})`);
    }
  }

  let totalArchived = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (let i = resumeIdx; i < intervals.length; i++) {
    const { start: intervalStart, end: intervalEnd } = intervals[i];
    const pct = Math.round(((i + 1) / intervals.length) * 100);

    logger.info(`Fetching TikTok posts: ${intervalStart.toISOString().slice(0, 10)} → ${intervalEnd.toISOString().slice(0, 10)}`);

    const items = await fetchTiktokPosts(intervalStart, intervalEnd);
    if (!items || items.length === 0) {
      logger.info(`No TikTok posts in this interval [${i + 1}/${intervals.length} — ${pct}%]`);
      continue;
    }

    const { archived, skipped, failed } = await archiveTiktokBatch(items);
    totalArchived += archived;
    totalSkipped += skipped;
    totalFailed += failed;

    const filled = Math.round(pct / 5);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    logger.info(`[${bar}] ${pct}% (${i + 1}/${intervals.length}) | ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
  }

  logger.success(`TikTok done: ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
}
