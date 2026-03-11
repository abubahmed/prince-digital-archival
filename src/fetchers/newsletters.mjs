import mailchimp from "@mailchimp/mailchimp_marketing";
import logger from "../util/logger.mjs";
import { sanitizeText } from "../util/text.mjs";

mailchimp.setConfig({
  apiKey: process.env.MAILCHIMP_API_KEY,
  server: process.env.MAILCHIMP_SERVER || "us7",
});

const BATCH_SIZE = 100;

export async function fetchNewsletters(start, end) {
  logger.trace(`Calling Mailchimp API for campaigns from ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`);
  logger.info(`Fetching newsletters from ${start.toISOString()} to ${end.toISOString()}`);

  const newsletters = [];
  let offset = 0;

  try {
    while (true) {
      const response = await mailchimp.campaigns.list({
        count: BATCH_SIZE,
        offset,
        since_create_time: start.toISOString(),
        sort_field: "create_time",
        sort_dir: "ASC",
      });

      const campaigns = response.campaigns ?? [];
      if (campaigns.length === 0) break;

      for (const campaign of campaigns) {
        if (!campaign || !campaign.id) {
          logger.warn(`Skipping invalid newsletter: ${campaign}`);
          continue;
        }
        if (!campaign?.id || (!campaign?.send_time && !campaign?.create_time)) {
          logger.warn(`Skipping newsletter missing required fields: ${campaign?.id}`);
          continue;
        }

        const ts = new Date(campaign.send_time || campaign.create_time);
        if (ts > end) return finalizeResults(newsletters);
        if (ts >= start) newsletters.push(campaign);
      }

      offset += campaigns.length;
      if (campaigns.length < BATCH_SIZE) break;
    }
  } catch (err) {
    logger.error(`Error fetching newsletters: ${err}`);
    if (newsletters.length === 0) return null;
  }

  return finalizeResults(newsletters);
}

async function populateContent(campaign) {
  logger.trace(`Fetching content for newsletter ${campaign.id}`);
  try {
    const response = await mailchimp.campaigns.getContent(campaign.id);
    const raw = response.plain_text ?? response.html ?? null;
    campaign.content = raw ? cleanNewsletterText(raw) : null;
  } catch (err) {
    logger.error(`Error fetching content for newsletter ${campaign.id}: ${err}`);
    campaign.content = null;
  }

  if (!campaign.settings?.subject_line) {
    campaign.settings = campaign.settings ?? {};
    campaign.settings.subject_line = "Daily Newsletter";
  }

  return campaign;
}

export function cleanNewsletterText(raw) {
  if (!raw) return "";

  let text = raw.replace(/\*\|[^|]+\|\*/g, "");
  const lines = [];

  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;

    line = line
      .replace(/\(https?:\/\/\S*\)?/gi, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\bmailto:\S+/gi, "")
      .replace(/\(\s*\)/g, "")
      .replace(/\[\s*\]/g, "")
      .replace(/\((?:\s|[^\p{L}\p{N}])*\)/gu, "")
      .replace(/\*{2,}/g, "")
      .replace(/\s*\(\s*$/g, "")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    if (!line) continue;

    const lower = line.toLowerCase();
    const skip = [
      "unsubscribe",
      "update your preferences",
      "why did i get this",
      "copyright ©",
      "add us to your address book",
      "list-manage.com",
      "view this email in your browser",
    ];
    // skip lines that are just a social/footer link label (e.g. "Twitter (", "Email")
    if (/^(twitter|facebook|youtube|instagram|email|spotify)\s*\(?$/i.test(line)) continue;
    if (skip.some((s) => lower.includes(s))) continue;
    if (/^read (the )?(story|opinion|piece)/i.test(line)) continue;
    if (/^[\s\-_*=·•]+$/.test(line)) continue;

    const letterCount = (line.match(/[A-Za-z]/g) || []).length;
    if (letterCount < 2) continue;

    lines.push(line);
  }

  let output = lines.join("\n");
  const referralIdx = output.toLowerCase().indexOf("referred by a friend");
  if (referralIdx !== -1) output = output.slice(0, referralIdx);
  return sanitizeText(output.replace(/\n{3,}/g, "\n\n").trim());
}

async function finalizeResults(newsletters) {
  newsletters.sort(
    (a, b) =>
      new Date(a.send_time || a.create_time) -
      new Date(b.send_time || b.create_time)
  );

  for (const campaign of newsletters) {
    await populateContent(campaign);
  }

  logger.success(`Fetched ${newsletters.length} newsletters with content`);
  return newsletters;
}
