import { eq, desc } from "drizzle-orm";
import db from "../db/client.mjs";
import { articles, failedItems } from "../db/schema.mjs";
import { fetchArticles } from "../fetchers/articles.mjs";
import { getBrowser } from "../media/browser.mjs";
import { upload, buildKey } from "../s3/client.mjs";
import { splitByMonth } from "../util/dates.mjs";
import { mapConcurrent } from "../util/concurrent.mjs";
import logger from "../util/logger.mjs";

const RETRIES = 5;
const PAGE_TIMEOUT = 60000;
const CONCURRENCY = 5;

async function convertArticleToPdf(url, browser) {
  let page;

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      page = await browser.newPage();

      await page.setCookie({
        name: "max-age",
        value: `${60 * 60 * 24 * 2}`,
        url,
        domain: new URL(url).host,
        path: "/",
        expires: Date.now() + 2 * 24 * 60 * 60 * 1000,
      });

      const res = await page.goto(url, {
        timeout: PAGE_TIMEOUT,
        waitUntil: ["domcontentloaded"],
      });

      if (!res || !res.ok()) {
        throw new Error(`Page load failed: ${res?.status() || "unknown"}`);
      }

      await page.waitForNetworkIdle({ timeout: PAGE_TIMEOUT, idleTime: 1000 }).catch(() => {
        logger.warn(`Network did not idle for ${url}`);
      });

      // skip if it's actually a newsletter page
      const isNewsletter = await page.evaluate(() => {
        return document.querySelectorAll("#awesomebar").length > 0;
      });
      if (isNewsletter) {
        logger.warn(`Skipping newsletter page: ${url}`);
        return null;
      }

      await page.evaluate(() => {
        const style = document.createElement("style");
        style.textContent = `
          @page { margin-top: 1in; margin-bottom: 1in; }
          @page :first { margin-top: 0.5in; margin-bottom: 1in; }
        `;
        (document.head || document.documentElement).appendChild(style);
      });

      const pdfBuffer = await page.pdf({
        displayHeaderFooter: true,
        width: "8.5in",
        height: "11in",
      });

      return pdfBuffer;
    } catch (err) {
      logger.warn(`PDF attempt ${attempt}/${RETRIES} failed for ${url}: ${err.message}`);
      if (attempt === RETRIES) return null;
    } finally {
      if (page && !page.isClosed()) {
        await page.close().catch(() => { });
      }
    }
  }

  return null;
}

async function processArticle(item, browser) {
  const existing = await db.select({ id: articles.id })
    .from(articles)
    .where(eq(articles.id, String(item.id)))
    .limit(1);

  if (existing.length > 0) return { status: "skipped" };

  let s3Key = null;
  try {
    const pdfBuffer = await convertArticleToPdf(item.url, browser);
    if (pdfBuffer) {
      s3Key = buildKey("articles", item.published_at, item.id, "media.pdf");
      await upload(s3Key, pdfBuffer);
    } else {
      logger.warn(`No PDF generated for article ${item.id}, archiving without media`);
    }
  } catch (mediaErr) {
    logger.warn(`Media failed for article ${item.id}: ${mediaErr.message}, archiving without media`);
  }

  return {
    status: "ready",
    row: {
      id: String(item.id),
      timestamp: new Date(item.published_at),
      url: item.url,
      headline: item.headline,
      content: item.content,
      tags: item.tags?.map((t) => t.name.toLowerCase().trim()) ?? [],
      s3_key: s3Key,
      metadata: item,
    },
  };
}

async function archiveArticleBatch(items, browser) {
  let archived = 0;
  let skipped = 0;
  let failed = 0;

  const results = await mapConcurrent(items, CONCURRENCY, async (item) => {
    try {
      return await processArticle(item, browser);
    } catch (err) {
      return { status: "failed", item, error: err };
    }
  });

  // sort by timestamp so DB inserts preserve chronological order
  results.sort((a, b) => {
    const tsA = a.row?.timestamp ?? new Date(a.item?.published_at ?? 0);
    const tsB = b.row?.timestamp ?? new Date(b.item?.published_at ?? 0);
    return tsA - tsB;
  });

  for (const result of results) {
    if (result.status === "skipped") { skipped++; continue; }
    if (result.status === "failed") {
      failed++;
      logger.error(`Failed to archive article ${result.item.id}: ${result.error.message}`);
      await db.insert(failedItems).values({
        source: "articles",
        error: result.error.message,
        rawData: result.item,
      }).catch((e) => logger.error(`Failed to log failure: ${e.message}`));
      continue;
    }

    try {
      await db.insert(articles).values(result.row);
      archived++;
      logger.info(`Archived article ${result.row.id}: ${result.row.headline}`);
    } catch (err) {
      failed++;
      logger.error(`Failed to insert article ${result.row.id}: ${err.message}`);
      await db.insert(failedItems).values({
        source: "articles",
        error: err.message,
        rawData: result.row.metadata,
      }).catch((e) => logger.error(`Failed to log failure: ${e.message}`));
    }
  }

  return { archived, skipped, failed };
}

export async function archiveArticles(start, end) {
  const intervals = splitByMonth(start, end);
  const browser = await getBrowser();

  // find where to resume from
  const latest = await db.select({ timestamp: articles.timestamp })
    .from(articles)
    .orderBy(desc(articles.timestamp))
    .limit(1);

  let resumeIdx = 0;
  if (latest.length > 0 && latest[0].timestamp > start) {
    const lastArchived = latest[0].timestamp;
    // find the interval containing the last archived article, then go back 1 for safety
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

    logger.info(`Fetching articles: ${intervalStart.toISOString().slice(0, 10)} → ${intervalEnd.toISOString().slice(0, 10)}`);

    const items = await fetchArticles(intervalStart, intervalEnd);
    if (!items || items.length === 0) {
      logger.info(`No articles in this interval [${i + 1}/${intervals.length} — ${pct}%]`);
      continue;
    }

    const { archived, skipped, failed } = await archiveArticleBatch(items, browser);
    totalArchived += archived;
    totalSkipped += skipped;
    totalFailed += failed;

    const filled = Math.round(pct / 5);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    logger.info(`[${bar}] ${pct}% (${i + 1}/${intervals.length}) | ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
  }

  logger.success(`Articles done: ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
}
