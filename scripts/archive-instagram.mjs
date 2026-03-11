import "dotenv/config";
import { setDebug } from "../src/s3/client.mjs";
import { archiveInstagram } from "../src/archivers/instagram.mjs";
import logger from "../src/util/logger.mjs";

if (process.argv.includes("-d")) {
  setDebug(true);
  logger.info("Debug mode: media also saved to data/s3/");
}

const START = new Date("1995-01-01");

logger.info(`Archiving Instagram posts since ${START.toISOString().slice(0, 10)}`);

try {
  await archiveInstagram(START);
} catch (err) {
  logger.error(`Instagram archiver crashed: ${err.message}`);
}
