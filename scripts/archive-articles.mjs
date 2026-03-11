import "dotenv/config";
import { setDebug } from "../src/s3/client.mjs";
import { closeBrowser } from "../src/media/browser.mjs";
import { archiveArticles } from "../src/archivers/articles.mjs";
import logger from "../src/util/logger.mjs";

if (process.argv.includes("-d")) {
  setDebug(true);
  logger.info("Debug mode: media also saved to data/s3/");
}

const START = new Date("1969-01-01");
const END = new Date();

logger.info(`Archiving articles from ${START.toISOString().slice(0, 10)} to ${END.toISOString().slice(0, 10)}`);

try {
  await archiveArticles(START, END);
} catch (err) {
  logger.error(`Articles archiver crashed: ${err.message}`);
}

await closeBrowser();
