import "dotenv/config";
import { archiveInstagram } from "../src/archivers/instagram.mjs";
import logger from "../src/util/logger.mjs";

const START = new Date("1969-01-01");

logger.info(`Archiving Instagram posts since ${START.toISOString().slice(0, 10)}`);

try {
  await archiveInstagram(START);
} catch (err) {
  logger.error(`Instagram archiver crashed: ${err.message}`);
}
