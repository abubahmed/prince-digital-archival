import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { fetchArticles } from "../src/fetchers/articles.mjs";
import { fetchInstagramPosts } from "../src/fetchers/instagram.mjs";
import { fetchTweets } from "../src/fetchers/twitter.mjs";
import { fetchTiktokPosts } from "../src/fetchers/tiktok.mjs";
import { fetchNewsletters } from "../src/fetchers/newsletters.mjs";
import logger from "../src/util/logger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data", "fetchers");
mkdirSync(DATA_DIR, { recursive: true });

function save(name, data) {
  const path = join(DATA_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2));
  logger.success(`Saved ${path}`);
}

const now = new Date();
const recentEnd = new Date(now);
recentEnd.setMonth(recentEnd.getMonth() - 2);
const recentStart = new Date(recentEnd);
recentStart.setMonth(recentStart.getMonth() - 1);

async function fetchOldestSamples(name, fetchFn) {
  let cursor = new Date("1995-01-01");
  while (cursor < now) {
    const end = new Date(cursor);
    end.setMonth(end.getMonth() + 1);
    logger.info(`${name} oldest: trying ${cursor.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`);
    const results = await fetchFn(cursor, end);
    if (results?.length > 0) return results.slice(0, 3);
    cursor = end;
  }
  return [];
}

// articles & newsletters: fetch oldest + recent samples
for (const { name, fetchFn } of [
  { name: "articles", fetchFn: (s, e) => fetchArticles(s, e) },
  { name: "newsletters", fetchFn: (s, e) => fetchNewsletters(s, e) },
]) {
  try {
    logger.info(`Fetching ${name} (oldest)...`);
    const oldSample = await fetchOldestSamples(name, fetchFn);
    logger.success(`${name} oldest: sampled ${oldSample.length}`);

    logger.info(`Fetching ${name} (recent)...`);
    const recent = await fetchFn(recentStart, recentEnd);
    const recentSample = recent?.slice(-3) ?? [];
    logger.success(`${name} recent: sampled ${recentSample.length}`);

    save(name, { oldest: oldSample, recent: recentSample });
  } catch (err) {
    logger.error(`Failed to fetch ${name}:`, err);
    save(name, { error: err.message });
  }
}

// other sources: single recent fetch
const start = new Date(now);
start.setDate(start.getDate() - 30);

const fetchers = [
  { name: "instagram", fn: () => fetchInstagramPosts(start) },
  { name: "twitter", fn: () => fetchTweets(start, now) },
  { name: "tiktok", fn: () => fetchTiktokPosts(new Date("2023-02-01"), now) },
];

for (const { name, fn } of fetchers) {
  logger.info(`Fetching ${name}...`);
  try {
    const results = await fn();
    if (!results || results.length === 0) {
      logger.warn(`No results for ${name}`);
      save(name, []);
      continue;
    }

    const sample = results.slice(0, 3);
    save(name, sample);
    logger.success(`${name}: ${results.length} total, saved ${sample.length} samples`);
  } catch (err) {
    logger.error(`Failed to fetch ${name}:`, err);
    save(name, { error: err.message });
  }
}
