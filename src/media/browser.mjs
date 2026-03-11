import puppeteer from "puppeteer";
import logger from "../util/logger.mjs";

let browser = null;

export async function getBrowser() {
  logger.trace("Getting browser instance");
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
  logger.trace("Closing browser instance");
  if (browser) {
    await browser.close();
    browser = null;
    logger.info("Browser closed");
  }
}
