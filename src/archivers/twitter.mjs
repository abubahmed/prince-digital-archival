import { eq, desc } from "drizzle-orm";
import db from "../db/client.mjs";
import { tweets, failedItems } from "../db/schema.mjs";
import { fetchTweets } from "../fetchers/twitter.mjs";
import { imagesToPdf } from "../media/pdf.mjs";
import { upload, buildKey } from "../s3/client.mjs";
import { splitByMonth } from "../util/dates.mjs";
import logger from "../util/logger.mjs";

function extractImageUrls(item) {
  const media = item.extendedEntities?.media || item.entities?.media || [];
  return media
    .filter((m) => (m.type === "photo" || m.type === "image") && m.media_url_https)
    .map((m) => m.media_url_https);
}

async function archiveTweetBatch(items) {
  logger.trace(`Archiving batch of ${items.length} tweets`);
  let archived = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const existing = await db.select({ id: tweets.id })
        .from(tweets)
        .where(eq(tweets.id, String(item.id)))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      let s3Key = null;
      const imageUrls = extractImageUrls(item);

      if (imageUrls.length > 0) {
        try {
          const pdfBuffer = await imagesToPdf(imageUrls);
          s3Key = buildKey("twitter", item.createdAt, item.id, "media.pdf");
          await upload(s3Key, pdfBuffer);
        } catch (mediaErr) {
          logger.warn(`Media failed for tweet ${item.id}: ${mediaErr.message}, archiving without media`);
        }
      }

      await db.insert(tweets).values({
        id: String(item.id),
        timestamp: new Date(item.createdAt),
        url: item.url,
        content: item.text || null,
        s3_key: s3Key,
        metadata: item,
      });

      archived++;
      logger.info(`Archived tweet ${item.id}`);
    } catch (err) {
      failed++;
      logger.error(`Failed to archive tweet ${item.id}: ${err.message}`);

      await db.insert(failedItems).values({
        source: "twitter",
        error: err.message,
        rawData: item,
      }).catch((e) => logger.error(`Failed to log failure: ${e.message}`));
    }
  }

  return { archived, skipped, failed };
}

export async function archiveTwitter(start, end) {
  logger.trace(`Starting Twitter archiver: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`);
  const intervals = splitByMonth(start, end);

  // resume from last archived tweet
  const latest = await db.select({ timestamp: tweets.timestamp })
    .from(tweets)
    .orderBy(desc(tweets.timestamp))
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

    logger.info(`Fetching tweets: ${intervalStart.toISOString().slice(0, 10)} → ${intervalEnd.toISOString().slice(0, 10)}`);

    const items = await fetchTweets(intervalStart, intervalEnd);
    if (!items || items.length === 0) {
      logger.info(`No tweets in this interval [${i + 1}/${intervals.length} — ${pct}%]`);
      continue;
    }

    const { archived, skipped, failed } = await archiveTweetBatch(items);
    totalArchived += archived;
    totalSkipped += skipped;
    totalFailed += failed;

    const filled = Math.round(pct / 5);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    logger.info(`[${bar}] ${pct}% (${i + 1}/${intervals.length}) | ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
  }

  logger.success(`Twitter done: ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
}
