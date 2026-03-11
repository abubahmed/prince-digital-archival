export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function isWithinRange(date, start, end) {
  const d = new Date(date);
  return d >= start && d <= end;
}

export function splitByMonth(start, end) {
  const intervals = [];
  let current = new Date(start);

  while (current < end) {
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
    intervals.push({
      start: new Date(current),
      end: monthEnd < end ? monthEnd : new Date(end),
    });
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return intervals;
}
