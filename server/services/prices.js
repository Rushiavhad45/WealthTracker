/**
 * Live price providers. Everything returned from here is in INR.
 *
 *  - Stocks  : Yahoo Finance chart API (unofficial, no key)  e.g. RELIANCE.NS
 *  - MFs     : mfapi.in (free AMFI NAV mirror, no key)
 *  - Gold    : COMEX gold (USD/oz) x USDINR, converted to INR/gram
 *
 * A "quote" is always { price, previousPrice, asOf? } where previousPrice is the
 * prior trading day's close / prior NAV (used for the "1 day change").
 */

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const MFAPI = 'https://api.mfapi.in/mf';
const TROY_OUNCE_GRAMS = 31.1034768;

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

/**
 * kind:
 *  - not_found   : the symbol / scheme does not exist (user error -> reject input)
 *  - unsupported : exists but is not priced in INR
 *  - unavailable : provider down / rate-limited / network (retry later)
 */
export class PriceError extends Error {
  constructor(message, kind = 'unavailable') {
    super(message);
    this.name = 'PriceError';
    this.kind = kind;
  }
}

class HttpStatusError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retryDelay = () => Number(process.env.PRICE_RETRY_DELAY_MS ?? 500);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** GET json with a timeout and retries on network errors / 429 / 5xx (never on 4xx). */
async function fetchJson(url, { headers = {}, attempts = 3, timeoutMs = 10_000 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return await res.json();
      const err = new HttpStatusError(res.status, url);
      if (res.status !== 429 && res.status < 500) throw err; // 4xx: retrying will not help
      lastError = err;
    } catch (err) {
      if (err instanceof HttpStatusError && err.status !== 429 && err.status < 500) throw err;
      lastError = err;
    }
    if (i < attempts - 1) await sleep(retryDelay() * (i + 1));
  }
  throw lastError;
}

/* ------------------------------------------------------------------ */
/* Yahoo Finance                                                       */
/* ------------------------------------------------------------------ */

export function toYahooTicker(symbol, exchange = 'NSE') {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) throw new PriceError('Missing stock symbol', 'not_found');
  if (raw.includes('.')) return raw; // already fully qualified (e.g. RELIANCE.BO)
  return `${raw}${String(exchange).toUpperCase() === 'BSE' ? '.BO' : '.NS'}`;
}

/** Calendar day of a unix timestamp in the exchange's local time. */
function localDay(tsSeconds, gmtoffset) {
  return new Date((tsSeconds + gmtoffset) * 1000).toISOString().slice(0, 10);
}

async function fetchYahooChart(ticker) {
  const url = `${YAHOO_CHART}${encodeURIComponent(ticker)}?interval=1d&range=10d`;
  let data;
  try {
    data = await fetchJson(url, { headers: YAHOO_HEADERS });
  } catch (err) {
    if (err.status === 404) throw new PriceError(`No price data found for ${ticker}`, 'not_found');
    throw new PriceError(`Price provider unavailable for ${ticker}: ${err.message}`, 'unavailable');
  }

  const result = data?.chart?.result?.[0];
  if (!result) {
    const code = data?.chart?.error?.code;
    throw new PriceError(
      `No price data for ${ticker}`,
      code === 'Not Found' ? 'not_found' : 'unavailable'
    );
  }

  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const candles = timestamps
    .map((ts, i) => ({ ts, close: closes[i] }))
    .filter((c) => c.close != null && Number.isFinite(Number(c.close)));

  const price = Number(meta.regularMarketPrice ?? candles.at(-1)?.close);
  if (!Number.isFinite(price) || price <= 0) {
    throw new PriceError(`No price data for ${ticker}`, 'unavailable');
  }

  // Previous close = last daily close strictly before the day of the latest price.
  // (meta.chartPreviousClose is the close before the whole 10d window - NOT yesterday.)
  const gmtoffset = Number(meta.gmtoffset ?? 19800);
  const latestTs = Number(meta.regularMarketTime ?? candles.at(-1)?.ts);
  let previousClose = null;
  if (Number.isFinite(latestTs)) {
    const latestDay = localDay(latestTs, gmtoffset);
    const prev = [...candles].reverse().find((c) => localDay(c.ts, gmtoffset) < latestDay);
    if (prev) previousClose = Number(prev.close);
  }

  return { price, previousClose, currency: meta.currency };
}

export async function fetchStockQuote(ticker) {
  const q = await fetchYahooChart(ticker);
  if (q.currency && q.currency !== 'INR') {
    throw new PriceError(
      `${ticker} is priced in ${q.currency}. Only INR-listed instruments (NSE/BSE) are supported.`,
      'unsupported'
    );
  }
  return { price: round2(q.price), previousPrice: q.previousClose != null ? round2(q.previousClose) : null };
}

/* ------------------------------------------------------------------ */
/* Gold (INR per gram, 24K)                                            */
/* ------------------------------------------------------------------ */

export function goldImportDutyPercent() {
  const n = Number(process.env.GOLD_IMPORT_DUTY_PERCENT ?? 6);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function fetchGoldQuote() {
  const [gold, fx] = await Promise.all([fetchYahooChart('GC=F'), fetchYahooChart('USDINR=X')]);
  const factor = 1 + goldImportDutyPercent() / 100;
  const perGram = (usdPerOunce, usdInr) => (usdPerOunce * usdInr * factor) / TROY_OUNCE_GRAMS;

  const hasPrev = gold.previousClose != null && fx.previousClose != null;
  return {
    price: round2(perGram(gold.price, fx.price)),
    previousPrice: hasPrev ? round2(perGram(gold.previousClose, fx.previousClose)) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Mutual funds (mfapi.in)                                             */
/* ------------------------------------------------------------------ */

/** mfapi dates are dd-mm-yyyy. */
function mfDateToIso(d) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(d || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export async function fetchMutualFundQuote(schemeCode) {
  const code = String(schemeCode ?? '').trim();
  if (!/^\d+$/.test(code)) throw new PriceError(`Invalid mutual fund scheme code "${code}"`, 'not_found');

  let data;
  try {
    data = await fetchJson(`${MFAPI}/${code}`);
  } catch (err) {
    if (err.status === 404) throw new PriceError(`No mutual fund with scheme code ${code}`, 'not_found');
    throw new PriceError(`NAV provider unavailable for scheme ${code}: ${err.message}`, 'unavailable');
  }

  // Newest first: [0] = latest NAV, [1] = previous NAV.
  const rows = Array.isArray(data?.data) ? data.data : [];
  const nav = Number(rows[0]?.nav);
  if (!rows.length || !Number.isFinite(nav) || nav <= 0) {
    throw new PriceError(`No NAV found for scheme ${code}`, 'not_found');
  }
  const prev = Number(rows[1]?.nav);

  return {
    price: nav,
    previousPrice: Number.isFinite(prev) && prev > 0 ? prev : null,
    asOf: mfDateToIso(rows[0]?.date),
    schemeName: data?.meta?.scheme_name,
  };
}

/** Search funds by name so the user can pick the exact plan (Direct/Regular, Growth/IDCW). */
export async function searchMutualFunds(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  let rows;
  try {
    rows = await fetchJson(`${MFAPI}/search?q=${encodeURIComponent(q)}`);
  } catch (err) {
    throw new PriceError(`Fund search unavailable: ${err.message}`, 'unavailable');
  }
  return (Array.isArray(rows) ? rows : []).slice(0, 25).map((r) => ({
    schemeCode: String(r.schemeCode),
    name: r.schemeName,
  }));
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

/**
 * Describe how to price a holding. Holdings that share a key (same stock, same
 * fund, gold) are fetched ONCE per update run no matter how many users own them.
 * Returns null for holdings that are not priced from an external feed.
 */
export function quoteRequestFor(investment) {
  switch (investment.type) {
    case 'stocks': {
      const ticker = toYahooTicker(investment.symbol, investment.exchange);
      return { key: `stock:${ticker}`, fetch: () => fetchStockQuote(ticker) };
    }
    case 'mutual_fund':
      return {
        key: `mf:${investment.schemeCode}`,
        fetch: () => fetchMutualFundQuote(investment.schemeCode),
      };
    case 'gold':
      return { key: 'gold:inr-per-gram', fetch: fetchGoldQuote };
    default:
      return null;
  }
}
