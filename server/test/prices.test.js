import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mfApiPayload, mockFetch, yahooChart } from './helpers.js';
import {
  PriceError, fetchGoldQuote, fetchMutualFundQuote, fetchStockQuote, quoteRequestFor, searchMutualFunds, toYahooTicker,
} from '../services/prices.js';

let mock;
afterEach(() => mock?.restore());

test('ticker mapping', () => {
  assert.equal(toYahooTicker('reliance'), 'RELIANCE.NS');
  assert.equal(toYahooTicker('RELIANCE', 'BSE'), 'RELIANCE.BO');
  assert.equal(toYahooTicker('RELIANCE.BO'), 'RELIANCE.BO');
  assert.equal(toYahooTicker('M&M'), 'M&M.NS');
});

test('stock quote: previous close is YESTERDAY, not Yahoo\'s chartPreviousClose', async () => {
  mock = mockFetch(() => ({ body: yahooChart({ price: 2510, closes: [2300, 2400, 2450, 2500, 2510] }) }));
  const q = await fetchStockQuote('RELIANCE.NS');
  assert.equal(q.price, 2510);
  assert.equal(q.previousPrice, 2500); // not 1.11
});

test('stock quote: works when today\'s candle close is still null (market open)', async () => {
  mock = mockFetch(() => ({ body: yahooChart({ price: 2510, closes: [2400, 2450, 2500, 2510], lastCloseNull: true }) }));
  const q = await fetchStockQuote('RELIANCE.NS');
  assert.equal(q.price, 2510);
  assert.equal(q.previousPrice, 2500);
});

test('stock quote: 404 -> not_found, no retries', async () => {
  mock = mockFetch(() => ({ status: 404, body: { chart: { result: null, error: { code: 'Not Found' } } } }));
  await assert.rejects(fetchStockQuote('NOPE.NS'), (e) => e instanceof PriceError && e.kind === 'not_found');
  assert.equal(mock.calls.length, 1);
});

test('stock quote: 5xx is retried 3x then reported as unavailable', async () => {
  mock = mockFetch(() => ({ status: 503, body: {} }));
  await assert.rejects(fetchStockQuote('TCS.NS'), (e) => e.kind === 'unavailable');
  assert.equal(mock.calls.length, 3);
});

test('stock quote: recovers when a retry succeeds', async () => {
  let n = 0;
  mock = mockFetch(() => (++n < 2 ? { status: 429, body: {} } : { body: yahooChart({ price: 100, closes: [99, 100] }) }));
  assert.equal((await fetchStockQuote('TCS.NS')).price, 100);
});

test('stock quote: non-INR listings are rejected (values must be INR)', async () => {
  mock = mockFetch(() => ({ body: yahooChart({ price: 190, closes: [188, 190], currency: 'USD' }) }));
  await assert.rejects(fetchStockQuote('AAPL'), (e) => e.kind === 'unsupported' && /INR/.test(e.message));
});

test('mutual fund: newest-first NAVs, dd-mm-yyyy -> ISO, scheme name', async () => {
  mock = mockFetch(() => ({ body: mfApiPayload({ navs: [['18-09-2026', '70.1234'], ['17-09-2026', '69.5']] }) }));
  const q = await fetchMutualFundQuote('122639');
  assert.deepEqual(q, { price: 70.1234, previousPrice: 69.5, asOf: '2026-09-18', schemeName: 'Test Fund - Direct Plan - Growth' });
});

test('mutual fund: non-numeric code is rejected without a network call', async () => {
  mock = mockFetch(() => ({ body: {} }));
  await assert.rejects(fetchMutualFundQuote('PPFAS'), (e) => e.kind === 'not_found');
  assert.equal(mock.calls.length, 0);
});

test('mutual fund: empty data -> not_found', async () => {
  mock = mockFetch(() => ({ body: { meta: {}, data: [], status: 'SUCCESS' } }));
  await assert.rejects(fetchMutualFundQuote('999999'), (e) => e.kind === 'not_found');
});

test('mutual fund search maps results and ignores tiny queries', async () => {
  mock = mockFetch(() => ({ body: [{ schemeCode: 122639, schemeName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth' }] }));
  assert.deepEqual(await searchMutualFunds('ab'), []);
  assert.equal(mock.calls.length, 0);
  assert.deepEqual(await searchMutualFunds('parag parikh'), [
    { schemeCode: '122639', name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth' },
  ]);
});

test('gold: COMEX USD/oz x USDINR -> INR/gram incl. import duty', async () => {
  mock = mockFetch((url) =>
    url.includes('GC%3DF')
      ? { body: yahooChart({ symbol: 'GC=F', price: 3000, closes: [2950, 3000], currency: 'USD' }) }
      : { body: yahooChart({ symbol: 'USDINR=X', price: 84, closes: [83, 84] }) }
  );
  const q = await fetchGoldQuote();
  // 3000 * 84 * 1.06 / 31.1034768
  assert.equal(q.price, 8588.11);
  assert.equal(q.previousPrice, Math.round(((2950 * 83 * 1.06) / 31.1034768) * 100) / 100);
});

test('quoteRequestFor: shared instruments share a key; manual types have none', () => {
  assert.equal(quoteRequestFor({ type: 'stocks', symbol: 'TCS', exchange: 'NSE' }).key, 'stock:TCS.NS');
  assert.equal(quoteRequestFor({ type: 'mutual_fund', schemeCode: '122639' }).key, 'mf:122639');
  assert.equal(quoteRequestFor({ type: 'gold' }).key, 'gold:inr-per-gram');
  assert.equal(quoteRequestFor({ type: 'fixed_deposit' }), null);
  assert.equal(quoteRequestFor({ type: 'real_estate' }), null);
});
