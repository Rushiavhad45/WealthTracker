// Indian financial year helpers. FY "2026-27" runs 1 Apr 2026 - 31 Mar 2027.

export function fyStartYear(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return m >= 4 ? y : y - 1;
}

export const fyLabel = (startYear) => `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

export const fyOf = (dateStr) => fyLabel(fyStartYear(dateStr));

/** "2026-27" -> 2026, or null if malformed (e.g. "2026-28"). */
export function parseFy(label) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(label || ''));
  if (!m) return null;
  const y = Number(m[1]);
  return (y + 1) % 100 === Number(m[2]) ? y : null;
}

export const fyBounds = (startYear) => ({ start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` });

/** Advance-tax instalment dates for the FY starting in `startYear`. */
export function advanceTaxDates(startYear) {
  return [
    { date: `${startYear}-06-15`, cumulativePercent: 15 },
    { date: `${startYear}-09-15`, cumulativePercent: 45 },
    { date: `${startYear}-12-15`, cumulativePercent: 75 },
    { date: `${startYear + 1}-03-15`, cumulativePercent: 100 },
  ];
}
