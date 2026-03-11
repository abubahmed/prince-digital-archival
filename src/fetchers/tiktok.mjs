import { ApifyClient } from "apify-client";
import logger from "../util/logger.mjs";
import { formatDate } from "../util/dates.mjs";
import { sanitizeText } from "../util/text.mjs";

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const ACTOR_ID = "clockworks/tiktok-scraper";

export async function fetchTiktokPosts(start, end) {
  logger.trace(`Calling Apify TikTok scraper for ${formatDate(start)} to ${formatDate(end)}`);
  logger.info(`Fetching TikTok posts from ${formatDate(start)} to ${formatDate(end)}`);

  try {
    const run = await apify.actor(ACTOR_ID).call({
      excludePinnedPosts: false,
      maxRepliesPerComment: 0,
      profiles: ["thedailyprincetonian"],
      proxyCountryCode: "None",
      resultsPerPage: 100,
      scrapeRelatedVideos: false,
      shouldDownloadAvatars: false,
      shouldDownloadCovers: false,
      shouldDownloadMusicCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadSubtitles: false,
      shouldDownloadVideos: true,
      oldestPostDateUnified: formatDate(start),
      newestPostDate: formatDate(end),
    });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    if (!items?.length || items[0]?.note === "No videos found to match the filter") {
      logger.info("No TikTok posts found in range");
      return null;
    }

    const filtered = items.filter((item) => {
      if (!item?.id || !item?.createTimeISO || (!item?.mediaUrls && !item?.videoMeta?.downloadAddr)) {
        logger.warn(`Skipping TikTok post missing required fields: ${item?.id}`);
        return false;
      }
      if (item.text) item.text = sanitizeText(item.text);
      const ts = new Date(item.createTimeISO);
      return ts >= start && ts <= end;
    });

    filtered.sort((a, b) => new Date(a.createTimeISO) - new Date(b.createTimeISO));
    logger.success(`Fetched ${filtered.length} TikTok posts`);
    return filtered;
  } catch (err) {
    logger.error(`Error fetching TikTok posts: ${err}`);
    return null;
  }
}
