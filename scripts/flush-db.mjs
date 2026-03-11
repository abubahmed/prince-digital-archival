import "dotenv/config";
import { sql } from "drizzle-orm";
import db from "../src/db/client.mjs";
import logger from "../src/util/logger.mjs";

const tables = ["articles", "instagram_posts", "tweets", "tiktok_posts", "newsletters"];

for (const table of tables) {
  await db.execute(sql.raw(`DELETE FROM ${table}`));
  logger.info(`Flushed ${table}`);
}

logger.success("All tables flushed.");
