import logger from "../util/logger.mjs";

export async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadImage(url) {
  logger.info(`Downloading image: ${url.slice(0, 80)}...`);
  return downloadBuffer(url);
}

export async function downloadVideo(url) {
  logger.info(`Downloading video: ${url.slice(0, 80)}...`);
  return downloadBuffer(url);
}
