import { ApifyClient } from "apify-client";
import logger from "../util/logger.mjs";
import { formatDate } from "../util/dates.mjs";
import { sanitizeText } from "../util/text.mjs";

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const ACTOR_ID = "apidojo/tweet-scraper";

export async function fetchTweets(start, end) {
  logger.info(`Fetching tweets from ${formatDate(start)} to ${formatDate(end)}`);

  try {
    const run = await apify.actor(ACTOR_ID).call({
      author: "princetonian",
      start: formatDate(start),
      end: formatDate(end),
      includeSearchTerms: false,
      maxItems: 5000,
      onlyImage: false,
      onlyQuote: false,
      onlyTwitterBlue: false,
      onlyVerifiedUsers: false,
      onlyVideo: false,
      sort: "Latest",
      tweetLanguage: "en",
    });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    if (!items?.length || items[0]?.noResults) {
      logger.info("No tweets found in range");
      return null;
    }

    const filtered = items.filter((item) => {
      if (!item?.id || !item?.url || !item?.createdAt) {
        logger.warn(`Skipping tweet missing required fields: ${item?.id}`);
        return false;
      }
      if (item.text) item.text = sanitizeText(item.text);
      const ts = new Date(item.createdAt);
      return ts >= start && ts <= end;
    });

    filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    logger.success(`Fetched ${filtered.length} tweets`);
    return filtered;
  } catch (err) {
    logger.error(`Error fetching tweets: ${err}`);
    return null;
  }
}
