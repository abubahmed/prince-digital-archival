export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function isWithinRange(date, start, end) {
  const d = new Date(date);
  return d >= start && d <= end;
}
