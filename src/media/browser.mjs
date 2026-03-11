import puppeteer from "puppeteer";
import logger from "../util/logger.mjs";

let browser = null;

export async function getBrowser() {
  if (!browser || !browser.connected) {
    logger.info("Launching browser...");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    logger.info("Browser closed");
  }
}
