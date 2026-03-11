import { eq, desc } from "drizzle-orm";
import db from "../db/client.mjs";
import { newsletters, failedItems } from "../db/schema.mjs";
import { fetchNewsletters } from "../fetchers/newsletters.mjs";
import { getBrowser } from "../media/browser.mjs";
import { upload, buildKey } from "../s3/client.mjs";
import { splitByMonth } from "../util/dates.mjs";
import logger from "../util/logger.mjs";

const RETRIES = 3;
const PAGE_TIMEOUT = 120000;

async function convertNewsletterToPdf(url, browser) {
  logger.trace(`Converting newsletter to PDF: ${url}`);
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
        waitUntil: ["networkidle2", "domcontentloaded"],
      });

      if (!res || !res.ok()) {
        throw new Error(`Page load failed: ${res?.status() || "unknown"}`);
      }

      // remove mailchimp banner and branding
      await page.evaluate(() => {
        document.querySelectorAll("#awesomebar").forEach((el) => el.remove());
        const bannerUrl = "https://cdn-images.mailchimp.com/monkey_rewards/intuit-mc-rewards-2.png";
        document.querySelectorAll(`img[src*='${bannerUrl}']`).forEach((el) => el.remove());
      });

      // wait for iframes
      const iframes = await page.$$("iframe");
      await Promise.all(iframes.map((el) => el.contentFrame().catch(() => {})));
      await new Promise((r) => setTimeout(r, 1000));

      const pdfBuffer = await page.pdf({
        width: "8.5in",
        height: "11in",
        displayHeaderFooter: false,
        margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
      });

      return pdfBuffer;
    } catch (err) {
      logger.warn(`PDF attempt ${attempt}/${RETRIES} failed for ${url}: ${err.message}`);
      if (attempt === RETRIES) return null;
    } finally {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  }

  return null;
}

async function archiveNewsletterBatch(items, browser) {
  logger.trace(`Archiving batch of ${items.length} newsletters`);
  let archived = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const existing = await db.select({ id: newsletters.id })
        .from(newsletters)
        .where(eq(newsletters.id, String(item.id)))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const archiveUrl = item.long_archive_url || item.archive_url;
      let s3Key = null;

      if (archiveUrl) {
        try {
          const pdfBuffer = await convertNewsletterToPdf(archiveUrl, browser);
          if (pdfBuffer) {
            const ts = item.send_time || item.create_time;
            s3Key = buildKey("newsletters", ts, item.id, "media.pdf");
            await upload(s3Key, pdfBuffer);
          } else {
            logger.warn(`No PDF generated for newsletter ${item.id}, archiving without media`);
          }
        } catch (mediaErr) {
          logger.warn(`Media failed for newsletter ${item.id}: ${mediaErr.message}, archiving without media`);
        }
      }

      const ts = new Date(item.send_time || item.create_time);
      const subjectLine = item.settings?.subject_line || "Daily Newsletter";

      await db.insert(newsletters).values({
        id: String(item.id),
        timestamp: ts,
        url: archiveUrl || null,
        subjectLine,
        content: item.content || null,
        s3_key: s3Key,
        metadata: item,
      });

      archived++;
      logger.info(`Archived newsletter ${item.id}: ${subjectLine}`);
    } catch (err) {
      failed++;
      logger.error(`Failed to archive newsletter ${item.id}: ${err.message}`);

      await db.insert(failedItems).values({
        source: "newsletters",
        error: err.message,
        rawData: item,
      }).catch((e) => logger.error(`Failed to log failure: ${e.message}`));
    }
  }

  return { archived, skipped, failed };
}

export async function archiveNewsletters(start, end) {
  logger.trace(`Starting newsletter archiver: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`);
  const intervals = splitByMonth(start, end);
  const browser = await getBrowser();

  // resume from last archived newsletter
  const latest = await db.select({ timestamp: newsletters.timestamp })
    .from(newsletters)
    .orderBy(desc(newsletters.timestamp))
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

    logger.info(`Fetching newsletters: ${intervalStart.toISOString().slice(0, 10)} → ${intervalEnd.toISOString().slice(0, 10)}`);

    const items = await fetchNewsletters(intervalStart, intervalEnd);
    if (!items || items.length === 0) {
      logger.info(`No newsletters in this interval [${i + 1}/${intervals.length} — ${pct}%]`);
      continue;
    }

    const { archived, skipped, failed } = await archiveNewsletterBatch(items, browser);
    totalArchived += archived;
    totalSkipped += skipped;
    totalFailed += failed;

    const filled = Math.round(pct / 5);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    logger.info(`[${bar}] ${pct}% (${i + 1}/${intervals.length}) | ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
  }

  logger.success(`Newsletters done: ${totalArchived} archived, ${totalSkipped} skipped, ${totalFailed} failed`);
}
