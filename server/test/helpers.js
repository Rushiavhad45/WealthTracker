// Shared test helpers: fake Yahoo / mfapi responses shaped like the real APIs.
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-test-secret';
process.env.PRICE_RETRY_DELAY_MS = '0';
process.env.GOLD_IMPORT_DUTY_PERCENT = '6';
process.env.AUTH_RATE_LIMIT ||= '1000';
process.env.REFRESH_RATE_LIMIT ||= '1000';

export const realFetch = globalThis.fetch;

const DAY = 86_400;

/**
 * Yahoo v8 chart payload. `closes` are daily closes, oldest -> newest; the last
 * one is "today". Each candle is 09:15 IST (03:45 UTC) on consecutive days.
 */
export function yahooChart({
  symbol = 'RELIANCE.NS',
  price,
  closes,
  currency = 'INR',
  gmtoffset = 19800,
  lastCloseNull = false,
}) {
  const series = closes ?? [price];
  const end = Date.UTC(2026, 8, 18, 3, 45) / 1000; // Fri 18 Sep 2026
  const timestamps = series.map((_, i) => end - (series.length - 1 - i) * DAY);
  const quote = series.map((c, i) => (lastCloseNull && i === series.length - 1 ? null : c));
  return {
    chart: {
      result: [
        {
          meta: {
            currency,
            symbol,
            gmtoffset,
            regularMarketPrice: price,
            regularMarketTime: end + 3600,
            // Deliberately the close BEFORE the whole window - the classic trap.
            chartPreviousClose: 1.11,
          },
          timestamp: timestamps,
          indicators: { quote: [{ close: quote }] },
        },
      ],
      error: null,
    },
  };
}

export const mfApiPayload = ({ name = 'Test Fund - Direct Plan - Growth', navs }) => ({
  meta: { scheme_name: name },
  data: navs.map(([date, nav]) => ({ date, nav: String(nav) })),
  status: 'SUCCESS',
});

/**
 * Replace global fetch. `handler(url)` returns { status?, body } or throws.
 * Requests to localhost still go to the real network (the API under test).
 * Returns { calls, restore }.
 */
export function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1') || u.startsWith('http://localhost')) {
      return realFetch(url, init);
    }
    calls.push(u);
    const out = await handler(u);
    const status = out.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => out.body,
    };
  };
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
