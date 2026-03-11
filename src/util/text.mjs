export function sanitizeText(text) {
  if (!text) return text;

  text = text.replace(/\n{2,}/g, "\n");
  text = text.replace(/\r{2,}/g, "\r");
  text = text.replace(/\t{2,}/g, "\t");
  text = text.replace(/[^\S\n\r\t]{2,}/g, " ");

  return text.trim();
}
