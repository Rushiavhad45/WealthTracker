const IST = 'Asia/Kolkata';
const DAY_MS = 86_400_000;

/** Today's date in India as YYYY-MM-DD (independent of the server's timezone). */
export function todayIST(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: IST });
}

export function monthLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  return d.toLocaleDateString('en-IN', { month: 'short', timeZone: IST });
}

function toUtc(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). Both are YYYY-MM-DD strings. */
export function daysBetween(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export function addDays(dateStr, n) {
  return fromUtc(toUtc(dateStr) + n * DAY_MS);
}

/** Calendar-month arithmetic that clamps to the last day of shorter months. */
export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const monthIndex = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(year, monthIndex, Math.min(d, lastDay)));
}

export function monthsBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  let months = (by - ay) * 12 + (bm - am);
  if (bd < ad) months -= 1;
  return months;
}
