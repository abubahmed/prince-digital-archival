import "dotenv/config";
import { setDebug } from "../src/s3/client.mjs";
import { closeBrowser } from "../src/media/browser.mjs";
import { archiveArticles } from "../src/archivers/articles.mjs";
import { archiveNewsletters } from "../src/archivers/newsletters.mjs";
import { archiveInstagram } from "../src/archivers/instagram.mjs";
import { archiveTwitter } from "../src/archivers/twitter.mjs";
import { archiveTiktok } from "../src/archivers/tiktok.mjs";
import logger from "../src/util/logger.mjs";

if (process.argv.includes("-d")) {
  setDebug(true);
  logger.info("Debug mode: media also saved to data/s3/");
}

const START = new Date("1995-01-01");
const END = new Date();

const sources = [
  { name: "Articles", fn: () => archiveArticles(START, END) },
  { name: "Newsletters", fn: () => archiveNewsletters(START, END) },
  { name: "Instagram", fn: () => archiveInstagram(START) },
  { name: "Twitter", fn: () => archiveTwitter(START, END) },
  { name: "TikTok", fn: () => archiveTiktok(START, END) },
];

logger.info(`Archiving from ${START.toISOString().slice(0, 10)} to ${END.toISOString().slice(0, 10)}`);

for (const { name, fn } of sources) {
  logger.info(`\n========== ${name} ==========`);
  await fn();
}

await closeBrowser();
logger.success("All archivers finished.");
