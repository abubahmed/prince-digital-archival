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
const DATA_DIR = join(__dirname, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

function save(name, data) {
  const path = join(DATA_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2));
  logger.success(`Saved ${path}`);
}

const end = new Date();
const start = new Date(end);
start.setDate(start.getDate() - 30);

const fetchers = [
  { name: "articles", fn: () => fetchArticles(start, end) },
  { name: "instagram", fn: () => fetchInstagramPosts(start) },
  { name: "twitter", fn: () => fetchTweets(start, end) },
  { name: "tiktok", fn: () => fetchTiktokPosts(new Date("2023-02-01"), end) },
  { name: "newsletters", fn: () => fetchNewsletters(start, end) },
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
