import { ApifyClient } from "apify-client";
import logger from "../util/logger.mjs";
import { formatDate } from "../util/dates.mjs";
import { sanitizeText } from "../util/text.mjs";

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const ACTOR_ID = "apify/instagram-scraper";
const PROFILE_URL = "https://www.instagram.com/dailyprincetonian/";

function isValidPost(item) {
  return (
    item?.id &&
    item?.timestamp &&
    item?.url &&
    item?.type &&
    (item?.displayUrl || item?.images?.length || item?.videoUrl)
  );
}

export async function fetchInstagramPosts(since) {
  logger.info(`Fetching Instagram posts since ${formatDate(since)}`);

  try {
    const run = await apify.actor(ACTOR_ID).call({
      addParentData: false,
      directUrls: [PROFILE_URL],
      onlyPostsNewerThan: formatDate(since),
      resultsType: "posts",
      resultsLimit: 5000,
    });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    if (!items?.length || items[0]?.error || items[0]?.errorDescription) {
      logger.error(`Apify error: ${items?.[0]?.error || items?.[0]?.errorDescription || "no results"}`);
      return null;
    }

    const filtered = items.filter((item) => {
      if (!isValidPost(item)) {
        logger.warn(`Skipping invalid Instagram post: ${item?.id}`);
        return false;
      }
      if (item.caption) item.caption = sanitizeText(item.caption);
      return new Date(item.timestamp) >= since;
    });

    filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    logger.success(`Fetched ${filtered.length} Instagram posts`);
    return filtered;
  } catch (err) {
    logger.error(`Error fetching Instagram posts: ${err}`);
    return null;
  }
}