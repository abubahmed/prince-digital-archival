import logger from "../util/logger.mjs";
import { sanitizeText } from "../util/text.mjs";

const SEARCH_URL = "https://www.dailyprincetonian.com/search.json";

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

function buildParams(start, end, page) {
  return new URLSearchParams({
    a: "1",
    s: "",
    ti: "",
    ts_month: pad(start.getMonth() + 1),
    ts_day: String(start.getDate()),
    ts_year: String(start.getFullYear()),
    te_month: pad(end.getMonth() + 1),
    te_day: String(end.getDate()),
    te_year: String(end.getFullYear()),
    au: "",
    tg: "",
    ty: "article",
    o: "date",
    page: String(page),
  });
}

export function buildArticleUrl(item) {
  const date = new Date(item.published_at);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `https://www.dailyprincetonian.com/article/${year}/${month}/${item.slug}`;
}

export function cleanHtmlContent(html) {
  if (!html || typeof html !== "string") return null;

  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "");

  const entities = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#39;": "'", "&apos;": "'",
    "&ndash;": "\u2013", "&mdash;": "\u2014", "&hellip;": "\u2026",
    "&lsquo;": "\u2018", "&rsquo;": "\u2019",
    "&ldquo;": "\u201C", "&rdquo;": "\u201D",
  };
  for (const [entity, char] of Object.entries(entities)) {
    text = text.replaceAll(entity, char);
  }

  text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
  text = text.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  text = text.replace(/[^\S\n]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return sanitizeText(text);
}

export async function fetchArticles(start, end) {
  const articles = [];
  let page = 1;

  while (true) {
    try {
      const url = `${SEARCH_URL}?${buildParams(start, end, page)}`;
      const res = await fetch(url);

      if (!res.ok) {
        logger.error(`Articles fetch failed (page ${page}): ${res.status}`);
        break;
      }

      const data = await res.json();
      const items = data?.items ?? [];

      if (items.length === 0) break;

      for (const item of items) {
        if (!item || !item.id) {
          logger.warn(`Skipping invalid article: ${item}`);
          continue;
        }
        if (!item?.id || !item?.published_at || !item?.slug) {
          logger.warn(`Skipping article missing required fields: ${item?.id}`);
          continue;
        }

        const publishedAt = new Date(item.published_at);
        if (publishedAt < start || publishedAt > end) continue;

        item.url = buildArticleUrl(item);
        item.content = item.content ? cleanHtmlContent(item.content) : null;
        item.abstract = item.abstract ? cleanHtmlContent(item.abstract) : null;

        articles.push(item);
      }

      logger.info(`Fetched page ${page} — ${items.length} articles`);
      page++;
    } catch (err) {
      logger.error(`Error fetching articles (page ${page}): ${err}`);
      break;
    }
  }

  articles.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
  logger.success(`Fetched ${articles.length} articles total`);
  return articles;
}
