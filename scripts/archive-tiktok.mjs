import "dotenv/config";
import { setDebug } from "../src/s3/client.mjs";
import { archiveTiktok } from "../src/archivers/tiktok.mjs";
import logger from "../src/util/logger.mjs";

if (process.argv.includes("-d")) {
  setDebug(true);
  logger.info("Debug mode: media also saved to data/s3/");
}

const START = new Date("1969-01-01");
const END = new Date();

logger.info(`Archiving TikTok posts from ${START.toISOString().slice(0, 10)} to ${END.toISOString().slice(0, 10)}`);

try {
  await archiveTiktok(START, END);
} catch (err) {
  logger.error(`TikTok archiver crashed: ${err.message}`);
}
