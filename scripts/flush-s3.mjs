import "dotenv/config";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { rmSync } from "fs";
import { join } from "path";
import logger from "../src/util/logger.mjs";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const BUCKET = process.env.AWS_BUCKET_NAME;
const PREFIX = "archives/";

let totalDeleted = 0;
let continuationToken;

do {
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: PREFIX,
    ContinuationToken: continuationToken,
  }));

  const objects = list.Contents;
  if (!objects || objects.length === 0) break;

  await s3.send(new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: { Objects: objects.map((o) => ({ Key: o.Key })) },
  }));

  totalDeleted += objects.length;
  logger.info(`Deleted ${objects.length} objects (${totalDeleted} total)`);

  continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
} while (continuationToken);

logger.success(`Flushed ${totalDeleted} objects from ${BUCKET}/${PREFIX}`);

const localDir = join(process.cwd(), "data", "s3");
try {
  rmSync(localDir, { recursive: true, force: true });
  logger.success(`Deleted local debug directory: ${localDir}`);
} catch (err) {
  logger.warn(`Could not delete local debug directory: ${err.message}`);
}
