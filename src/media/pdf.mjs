import PDFDocument from "pdfkit";
import imageSize from "image-size";
import { PassThrough } from "stream";
import logger from "../util/logger.mjs";
import { downloadImage } from "./download.mjs";

export async function imagesToPdf(urls) {
  logger.trace(`Building PDF from ${urls?.length ?? 0} image(s)`);
  if (!urls || urls.length === 0) {
    throw new Error("No image URLs provided");
  }

  const doc = new PDFDocument({ autoFirstPage: false });
  const stream = new PassThrough();
  doc.pipe(stream);

  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));

  for (const url of urls) {
    const buffer = await downloadImage(url);
    const { width, height } = imageSize(buffer);

    doc.addPage({ size: [width, height] });
    doc.image(buffer, 0, 0, { width, height });
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("end", () => {
      logger.info(`Created PDF from ${urls.length} image(s)`);
      resolve(Buffer.concat(chunks));
    });
    stream.on("error", reject);
  });
}
