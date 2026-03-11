import "dotenv/config";
import { closeBrowser } from "../src/media/browser.mjs";
import { archiveNewsletters } from "../src/archivers/newsletters.mjs";
import logger from "../src/util/logger.mjs";

const START = new Date("1969-01-01");
const END = new Date();

logger.info(`Archiving newsletters from ${START.toISOString().slice(0, 10)} to ${END.toISOString().slice(0, 10)}`);

try {
  await archiveNewsletters(START, END);
} catch (err) {
  logger.error(`Newsletters archiver crashed: ${err.message}`);
}

await closeBrowser();
