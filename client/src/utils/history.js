const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RANGE_DAYS = { '1M': 30, '6M': 183, '1Y': 365, All: null };

/** "2026-09-18" -> "18 Sep" (parsed by hand: no timezone surprises). */
export function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function longDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Keep points from the last N days (relative to the newest point, not the browser clock). */
export function filterRange(points, range) {
  const days = RANGE_DAYS[range];
  if (!points.length || days == null) return points;
  const last = new Date(`${points[points.length - 1].date}T00:00:00Z`).getTime();
  const cutoff = last - days * 86_400_000;
  return points.filter((p) => new Date(`${p.date}T00:00:00Z`).getTime() >= cutoff);
}

/** One bar per calendar month: the last recorded value in that month. */
export function toMonthly(points) {
  const byMonth = new Map();
  for (const p of points) byMonth.set(p.date.slice(0, 7), p);
  return [...byMonth.values()].map((p) => ({
    month: MONTHS[Number(p.date.slice(5, 7)) - 1],
    value: p.current,
    date: p.date,
  }));
}
