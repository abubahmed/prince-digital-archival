import "dotenv/config";
import { archiveTwitter } from "../src/archivers/twitter.mjs";
import logger from "../src/util/logger.mjs";

const START = new Date("1969-01-01");
const END = new Date();

logger.info(`Archiving tweets from ${START.toISOString().slice(0, 10)} to ${END.toISOString().slice(0, 10)}`);

try {
  await archiveTwitter(START, END);
} catch (err) {
  logger.error(`Twitter archiver crashed: ${err.message}`);
}
