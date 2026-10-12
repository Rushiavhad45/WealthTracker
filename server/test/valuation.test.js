import test from 'node:test';
import assert from 'node:assert/strict';
import { bondValue, computedValue, fixedDepositValue, markStale, realEstateValue, valuate } from '../services/valuation.js';
import { addDays, addMonths, daysBetween, monthsBetween, todayIST } from '../utils/dates.js';

const ctx = { asOf: '2026-09-18', now: new Date('2026-09-18T18:00:00Z') };

test('stocks: value = quantity x price, day change from previous close', () => {
  const set = valuate({ type: 'stocks', quantity: 10 }, { price: 2500, previousPrice: 2400 }, ctx);
  assert.equal(set.current, 25000);
  assert.equal(set.dayChange, 1000);
  assert.equal(set.priceStatus, 'ok');
  assert.equal(set.currentPrice, 2500);
});

test('stocks: no previous close -> day change 0, not NaN', () => {
  const set = valuate({ type: 'stocks', quantity: 3 }, { price: 100, previousPrice: null }, ctx);
  assert.equal(set.dayChange, 0);
  assert.equal(set.current, 300);
});

test('mutual funds: value = units x NAV, sets nav', () => {
  const set = valuate({ type: 'mutual_fund', units: 100.5 }, { price: 70, previousPrice: 69.5 }, ctx);
  assert.equal(set.current, 7035);
  assert.equal(set.dayChange, 50.25);
  assert.equal(set.nav, 70);
});

test('gold: scales 24K price by purity', () => {
  const set = valuate({ type: 'gold', grams: 10, purity: 22 }, { price: 7200, previousPrice: 7100 }, ctx);
  assert.equal(set.currentPerGram, 6600); // 7200 * 22/24
  assert.equal(set.current, 66000);
  assert.equal(set.dayChange, 916.67); // 10 g * (7200 - 7100) * 22/24
  assert.equal(set.currentPrice, 7200); // stored as 24K reference price
});

test('gold: defaults to 24K', () => {
  const set = valuate({ type: 'gold', grams: 5 }, { price: 7000, previousPrice: 7000 }, ctx);
  assert.equal(set.current, 35000);
});

test('fixed deposit: quarterly compounding for exactly one year', () => {
  const inv = { type: 'fixed_deposit', invested: 500000, rate: 7.25, purchaseDate: '2025-09-18', maturityDate: '2030-09-18' };
  // 500000 * (1 + 0.0725/4)^4  (365 days = 1.0 year)
  assert.equal(fixedDepositValue(inv, '2026-09-18'), 537247.51);
});

test('fixed deposit: stops growing at maturity, never negative time', () => {
  const inv = { type: 'fixed_deposit', invested: 100000, rate: 7, purchaseDate: '2024-01-01', maturityDate: '2025-01-01' };
  assert.equal(fixedDepositValue(inv, '2030-01-01'), fixedDepositValue(inv, '2025-01-01'));
  assert.equal(fixedDepositValue(inv, '2023-06-01'), 100000); // before purchase
});

test('fixed deposit: daily day-change is a small positive accrual', () => {
  const inv = { type: 'fixed_deposit', invested: 500000, rate: 7.25, purchaseDate: '2025-09-18', maturityDate: '2030-09-18' };
  const set = valuate(inv, null, ctx);
  assert.equal(set.priceSource, 'computed');
  assert.ok(set.dayChange > 90 && set.dayChange < 110, `expected ~₹99/day, got ${set.dayChange}`);
});

test('bonds: manual without coupon data, accrues with it', () => {
  assert.equal(computedValue({ type: 'bonds', invested: 100000 }, '2026-09-18'), null);
  assert.equal(valuate({ type: 'bonds', invested: 100000 }, null, ctx), null);
  const inv = { type: 'bonds', invested: 100000, faceValue: 1000, quantity: 100, couponRate: 7.18, purchaseDate: '2025-09-18' };
  assert.equal(bondValue(inv, '2026-09-18'), 107180);
});

test('real estate: manual unless an appreciation rate is set', () => {
  assert.equal(valuate({ type: 'real_estate', invested: 5000000 }, null, ctx), null);
  const inv = { type: 'real_estate', invested: 1000000, appreciationRate: 8, purchaseDate: '2025-09-18' };
  assert.equal(realEstateValue(inv, '2026-09-18'), 1080000);
});

test('markStale keeps status honest and zeroes day change', () => {
  assert.deepEqual(markStale({ lastPriceAt: new Date() }, 'boom'), { priceStatus: 'stale', lastPriceError: 'boom', dayChange: 0 });
  assert.equal(markStale({}, 'boom').priceStatus, 'pending');
});

test('date helpers', () => {
  assert.equal(addMonths('2025-01-31', 1), '2025-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2024-08-15', 36), '2027-08-15');
  assert.equal(addMonths('2024-11-15', 3), '2025-02-15');
  assert.equal(monthsBetween('2024-08-15', '2027-08-15'), 36);
  assert.equal(daysBetween('2025-09-18', '2026-09-18'), 365);
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.match(todayIST(), /^\d{4}-\d{2}-\d{2}$/);
  // 20:00 UTC on the 18th is already 01:30 IST on the 19th
  assert.equal(todayIST(new Date('2026-09-18T20:00:00Z')), '2026-09-19');
});
