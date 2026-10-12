import { todayIST } from '../utils/dates.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const TYPE_LABELS = {
  stocks: 'Stocks',
  mutual_fund: 'Mutual Fund',
  fixed_deposit: 'Fixed Deposit',
  gold: 'Gold',
  real_estate: 'Real Estate',
  bonds: 'Bonds',
};

export const CSV_HEADERS = [
  'Type',
  'Name',
  'Symbol / Scheme code',
  'Quantity / Units / Grams',
  'Purchase date',
  'Invested (INR)',
  'Current value (INR)',
  'Gain / Loss (INR)',
  'Return (%)',
  'Day change (INR)',
  'Price status',
  'Last price update (IST)',
];

/**
 * Cells that start with = + - @ (or tab / CR) are executed as formulas by Excel
 * and Google Sheets. Names are user-typed, so neutralise them with a leading
 * apostrophe (OWASP "CSV injection"). Numbers are written as numbers, untouched.
 */
export function textCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s;
}

export function escape(cell) {
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  const s = String(cell ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function holdingRow(inv) {
  const gain = round2(inv.current - inv.invested);
  const pct = inv.invested > 0 ? round2((gain / inv.invested) * 100) : 0;
  const idCol = inv.type === 'mutual_fund' ? inv.schemeCode : inv.symbol;
  const qty = inv.quantity ?? inv.units ?? inv.grams ?? '';
  const updated = inv.lastPriceAt
    ? new Date(inv.lastPriceAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
    : '';

  return [
    TYPE_LABELS[inv.type] || inv.type,
    textCell(inv.name),
    textCell(idCol),
    qty,
    inv.purchaseDate || '',
    inv.invested,
    inv.current,
    gain,
    pct,
    inv.dayChange ?? 0,
    inv.priceStatus,
    updated,
  ];
}

/** Build the CSV text (UTF-8 BOM so Excel opens ₹-free text and unicode names correctly). */
export function portfolioToCsv(investments) {
  const rows = [CSV_HEADERS, ...investments.map(holdingRow)];
  return `\uFEFF${rows.map((r) => r.map(escape).join(',')).join('\r\n')}\r\n`;
}

export const csvFilename = () => `wealthtrack-portfolio-${todayIST()}.csv`;

/** Capital-gains statement (per sale + summary) for a CA / ITR Schedule CG. */
export function taxStatementToCsv(report) {
  const head = [
    'Asset', 'Tax category', 'Purchase date', 'Sale date', 'Holding (months)', 'Quantity',
    'Sale value (INR)', 'Expenses (INR)', 'Cost of acquisition (INR)', 'Cost used for tax (INR)',
    'Gain / Loss (INR)', 'Term', 'Tax class',
  ];
  const rows = report.sales.map((s) => [
    textCell(s.name), textCell(s.taxKindLabel), s.purchaseDate, s.saleDate, s.holdingMonths, s.quantity ?? '',
    s.saleValue, s.expenses, s.cost, s.costUsed, s.gain, s.term, s.taxClass,
  ]);
  const t = report.tax;
  const blank = [];
  const kv = (k, v) => [k, ...Array(9).fill(''), v];
  const lines = [
    [`Capital gains statement - FY ${report.fy}`],
    [`Estimate only; ${report.rulesVersion}`],
    blank,
    head,
    ...rows,
    blank,
    kv('Net realised gain / loss (INR)', report.summary.netGain),
    kv('Exempt gain (INR)', report.summary.exemptGain),
    kv('Equity LTCG exemption used (INR)', t.exemptionUsed),
    kv('Basic tax (INR)', t.basicTax),
    kv('Surcharge (INR)', t.surcharge),
    kv('Cess (INR)', t.cess),
    kv('Estimated tax payable (INR)', t.payable),
    kv('Short-term loss to carry forward (INR)', t.carryForward.shortTerm),
    kv('Long-term loss to carry forward (INR)', t.carryForward.longTerm),
  ];
  return `\uFEFF${lines.map((r) => r.map(escape).join(',')).join('\r\n')}\r\n`;
}
