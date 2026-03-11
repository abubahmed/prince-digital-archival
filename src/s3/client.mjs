import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import logger from "../util/logger.mjs";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const BUCKET = process.env.AWS_BUCKET_NAME;
const LOCAL_S3_DIR = join(process.cwd(), "data", "s3");

let debug = false;

export function setDebug(enabled) {
  debug = enabled;
}

export async function upload(key, body) {
  logger.trace(`Uploading to S3: ${key} (${body.length} bytes)`);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
    })
  );

  if (debug) {
    logger.info(`Debug mode: saving to ${LOCAL_S3_DIR}/${key}`);
    try {
      const localPath = join(LOCAL_S3_DIR, key);
      mkdirSync(dirname(localPath), { recursive: true });
      writeFileSync(localPath, Buffer.from(body));
    } catch (err) {
      logger.error(`Debug save failed for ${key}: ${err.message}`);
    }
  }

  return key;
}

export function buildKey(source, timestamp, id, filename, slug) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const folder = slug ? `${id}-${slug}` : id;
  return `archives/${source}/${year}/${month}/${folder}/${filename}`;
}
