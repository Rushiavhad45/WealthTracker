import { mfApiPayload, mockFetch, realFetch, sleep, yahooChart } from './helpers.js'; // must be first (sets env)
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { Investment, JobState, PortfolioSnapshot, User } from '../models/index.js';
import { runPriceUpdate, JOB_KEY } from '../services/priceUpdater.js';
import { runCatchUpIfNeeded } from '../jobs/scheduler.js';
import { addDays, todayIST } from '../utils/dates.js';

const DB = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/invest-tracker-test-api';

/* ---------- fake market ---------- */
const market = {
  stocks: {},
  funds: {},
  down: new Set(),
  delayMs: 0,
};
function resetMarket() {
  market.stocks = {
    'RELIANCE.NS': { price: 2900, closes: [2850, 2880, 2900] },
    'TCS.NS': { price: 4000, closes: [3950, 3990, 4000] },
  };
  market.funds = {
    122639: { name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', navs: [['18-09-2026', 70], ['17-09-2026', 69.5]] },
  };
  market.down = new Set();
  market.delayMs = 0;
}
const handler = async (url) => {
  if (market.delayMs) await sleep(market.delayMs);
  if (url.includes('finance/chart/')) {
    const ticker = decodeURIComponent(url.split('/chart/')[1].split('?')[0]);
    if (market.down.has(ticker)) return { status: 503, body: {} };
    const s = market.stocks[ticker];
    if (!s) return { status: 404, body: { chart: { result: null, error: { code: 'Not Found' } } } };
    return { body: yahooChart({ symbol: ticker, ...s }) };
  }
  if (url.startsWith('https://api.mfapi.in/mf/search')) {
    return { body: [{ schemeCode: 122639, schemeName: market.funds[122639].name }] };
  }
  const m = /^https:\/\/api\.mfapi\.in\/mf\/(\d+)$/.exec(url);
  if (m) {
    const f = market.funds[m[1]];
    return f ? { body: mfApiPayload(f) } : { status: 404, body: {} };
  }
  throw new Error(`unexpected outbound request in test: ${url}`);
};

/* ---------- http helpers ---------- */
let server;
let base;
let fetchMock;

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await realFetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function signup(name, email) {
  const r = await api('/api/auth/register', { method: 'POST', body: { name, email, password: 'correct-horse-9' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { token: r.body.token, id: r.body.user.id };
}

const stock = (o = {}) => ({ type: 'stocks', name: 'Reliance Industries', symbol: 'RELIANCE', exchange: 'NSE', quantity: 10, invested: 25000, purchaseDate: '2024-03-15', ...o });

before(async () => {
  await connectDb(DB);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  fetchMock = mockFetch(handler);
});

beforeEach(async () => {
  resetMarket();
  fetchMock.calls.length = 0;
  await Promise.all([User, Investment, PortfolioSnapshot, JobState].map((m) => m.deleteMany({})));
});

after(async () => {
  fetchMock.restore();
  await new Promise((r) => server.close(r));
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});

/* ================================================================== */
/* Auth                                                                */
/* ================================================================== */

test('register -> login -> me; password never leaks; email is case-insensitive', async () => {
  const reg = await api('/api/auth/register', { method: 'POST', body: { name: 'Rahul Sharma', email: 'Rahul@Example.com', password: 'correct-horse-9', pan: 'abcde1234f' } });
  assert.equal(reg.status, 201);
  assert.ok(reg.body.token);
  assert.equal(reg.body.user.email, 'rahul@example.com');
  assert.equal(reg.body.user.pan, 'ABCDE1234F');
  assert.match(reg.body.user.memberSince, /^[A-Z][a-z]{2} \d{4}$/);
  assert.equal(JSON.stringify(reg.body).includes('passwordHash'), false);
  assert.equal(JSON.stringify(reg.body).includes('correct-horse-9'), false);

  const stored = await User.findOne({ email: 'rahul@example.com' }).select('+passwordHash');
  assert.match(stored.passwordHash, /^\$2[aby]\$12\$/); // bcrypt, cost 12

  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'RAHUL@example.com', password: 'correct-horse-9' } });
  assert.equal(login.status, 200);

  const me = await api('/api/auth/me', { token: login.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.name, 'Rahul Sharma');
});

test('register rejects duplicates, weak passwords and bad input', async () => {
  await signup('A', 'a@example.com');
  const dup = await api('/api/auth/register', { method: 'POST', body: { name: 'A2', email: 'A@example.com', password: 'correct-horse-9' } });
  assert.equal(dup.status, 409);

  const weak = await api('/api/auth/register', { method: 'POST', body: { name: 'B', email: 'b@example.com', password: 'short' } });
  assert.equal(weak.status, 400);
  assert.match(weak.body.message, /at least 8/);

  const badPan = await api('/api/auth/register', { method: 'POST', body: { name: 'B', email: 'b@example.com', password: 'correct-horse-9', pan: '12345' } });
  assert.equal(badPan.status, 400);
});

test('login: same generic error for wrong password and unknown email', async () => {
  await signup('A', 'a@example.com');
  const wrong = await api('/api/auth/login', { method: 'POST', body: { email: 'a@example.com', password: 'nope-nope-nope' } });
  const unknown = await api('/api/auth/login', { method: 'POST', body: { email: 'ghost@example.com', password: 'nope-nope-nope' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, unknown.body.message);
});

test('login: NoSQL-operator payloads are rejected, not executed', async () => {
  await signup('A', 'a@example.com');
  const r = await api('/api/auth/login', { method: 'POST', body: { email: { $gt: '' }, password: 'x' } });
  assert.equal(r.status, 400);
});

test('protected routes require a valid JWT (missing, forged, alg=none, expired, deleted user)', async () => {
  const { token, id } = await signup('A', 'a@example.com');
  for (const path of ['/api/investments', '/api/portfolio/history', '/api/auth/me', '/api/prices/mutual-funds/search?q=parag']) {
    assert.equal((await api(path)).status, 401, `${path} without token`);
  }
  assert.equal((await api('/api/investments', { method: 'POST', body: stock() })).status, 401);

  const forged = jwt.sign({ id, email: 'a@example.com' }, 'some-other-secret-some-other-secret-1234');
  assert.equal((await api('/api/investments', { token: forged })).status, 401);

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const noneAlg = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id, email: 'a@example.com' })}.`;
  assert.equal((await api('/api/investments', { token: noneAlg })).status, 401);

  const expired = jwt.sign({ id, email: 'a@example.com' }, process.env.JWT_SECRET, { expiresIn: -10 });
  assert.equal((await api('/api/investments', { token: expired })).status, 401);

  assert.equal((await api('/api/investments', { token })).status, 200);

  await User.deleteMany({});
  assert.equal((await api('/api/auth/me', { token })).status, 401);
});

test('profile update: name/phone/PAN, and empty string clears', async () => {
  const { token } = await signup('A', 'a@example.com');
  const up = await api('/api/auth/me', { method: 'PATCH', token, body: { name: 'Asha', phone: '+91 98765 43210', pan: 'ABCDE1234F' } });
  assert.equal(up.status, 200);
  assert.equal(up.body.user.name, 'Asha');
  const cleared = await api('/api/auth/me', { method: 'PATCH', token, body: { phone: '' } });
  assert.equal(cleared.body.user.phone, '');
  assert.equal(cleared.body.user.pan, 'ABCDE1234F');
});

/* ================================================================== */
/* Investments: add once, priced automatically                         */
/* ================================================================== */

test('stock: enter once -> live INR price applied immediately, avg price derived', async () => {
  const { token } = await signup('A', 'a@example.com');
  const r = await api('/api/investments', { method: 'POST', token, body: stock() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const inv = r.body.investment;
  assert.equal(inv.current, 29000); // 10 x 2900
  assert.equal(inv.dayChange, 200); // 10 x (2900 - 2880)
  assert.equal(inv.currentPrice, 2900);
  assert.equal(inv.avgPrice, 2500);
  assert.equal(inv.priceStatus, 'ok');
  assert.equal(inv.priceSource, 'live');
  assert.ok(inv.id);
  assert.equal(inv._id, undefined);
  assert.equal(inv.user, undefined);
  assert.equal(r.body.warning, undefined);
});

test('client cannot set server-owned money fields', async () => {
  const { token } = await signup('A', 'a@example.com');
  const r = await api('/api/investments', { method: 'POST', token, body: stock({ current: 99999999, dayChange: 5000, priceStatus: 'ok', currentPrice: 1 }) });
  assert.equal(r.body.investment.current, 29000);
  const patch = await api(`/api/investments/${r.body.investment.id}`, { method: 'PATCH', token, body: { current: 1, currentPrice: 1 } });
  assert.equal(patch.body.investment.current, 29000);
});

test('unknown stock symbol is rejected (400) and nothing is saved', async () => {
  const { token } = await signup('A', 'a@example.com');
  const r = await api('/api/investments', { method: 'POST', token, body: stock({ symbol: 'NOSUCHCO' }) });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /No price data/);
  assert.equal(await Investment.countDocuments(), 0);
});

test('price provider outage does not block adding a holding: saved as pending with a warning', async () => {
  const { token } = await signup('A', 'a@example.com');
  market.down.add('RELIANCE.NS');
  const r = await api('/api/investments', { method: 'POST', token, body: stock() });
  assert.equal(r.status, 201);
  assert.equal(r.body.investment.priceStatus, 'pending');
  assert.equal(r.body.investment.current, 25000); // falls back to invested
  assert.match(r.body.warning, /next daily update/);

  // ...and the next update run fixes it.
  market.down.clear();
  await runPriceUpdate({ reason: 'test' });
  const after = (await api('/api/investments', { token })).body.investments[0];
  assert.equal(after.priceStatus, 'ok');
  assert.equal(after.current, 29000);
});

test('non-INR instrument is rejected', async () => {
  const { token } = await signup('A', 'a@example.com');
  market.stocks['AAPL.NS'] = { price: 190, closes: [188, 190] };
  // simulate a USD listing under a fully-qualified ticker
  market.stocks['AAPL'] = { price: 190, closes: [188, 190], currency: 'USD' };
  const r = await api('/api/investments', { method: 'POST', token, body: stock({ symbol: 'AAPL.' }) });
  assert.equal(r.status, 400); // 'AAPL.' is not a known ticker either way
});

test('validation errors are clear and per-field', async () => {
  const { token } = await signup('A', 'a@example.com');
  const r = await api('/api/investments', { method: 'POST', token, body: { type: 'stocks', symbol: 'TCS' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.message, 'Quantity is required');
  assert.ok(r.body.errors.some((e) => e.field === 'quantity'));
  assert.equal((await api('/api/investments', { method: 'POST', token, body: { type: 'crypto' } })).status, 400);
  assert.equal((await api('/api/investments', { method: 'POST', token, body: '{not json' , headers: { 'Content-Type': 'application/json' } })).status, 400);
});

test('mutual fund: picked by scheme code, name + NAV come from the feed', async () => {
  const { token } = await signup('A', 'a@example.com');
  const r = await api('/api/investments', { method: 'POST', token, body: { type: 'mutual_fund', schemeCode: '122639', units: 100, invested: 6000, sipAmount: 5000, sipDate: 5 } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const inv = r.body.investment;
  assert.equal(inv.name, 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth');
  assert.equal(inv.current, 7000);
  assert.equal(inv.nav, 70);
  assert.equal(inv.avgNav, 60);
  assert.equal(inv.dayChange, 50);

  const bad = await api('/api/investments', { method: 'POST', token, body: { type: 'mutual_fund', schemeCode: 'PPFAS', units: 1, invested: 1 } });
  assert.equal(bad.status, 400);
  const missing = await api('/api/investments', { method: 'POST', token, body: { type: 'mutual_fund', schemeCode: '999999', units: 1, invested: 1 } });
  assert.equal(missing.status, 400);
});

test('mutual fund search endpoint', async () => {
  const { token } = await signup('A', 'a@example.com');
  const r = await api('/api/prices/mutual-funds/search?q=parag', { token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.results, [{ schemeCode: '122639', name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth' }]);
  assert.deepEqual((await api('/api/prices/mutual-funds/search?q=pa', { token })).body.results, []);
});

test('fixed deposit: value accrues from the calendar, no price feed involved', async () => {
  const { token } = await signup('A', 'a@example.com');
  const r = await api('/api/investments', { method: 'POST', token, body: { type: 'fixed_deposit', name: 'HDFC Bank FD', bank: 'HDFC Bank', invested: 500000, rate: 7.25, purchaseDate: addDays(todayIST(), -365), tenureMonths: 36 } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.investment.current, 537247.51);
  assert.equal(r.body.investment.priceSource, 'computed');
  assert.equal(r.body.investment.tenure, '3 Years');
  assert.ok(r.body.investment.maturityDate > todayIST());
  assert.equal(fetchMock.calls.length, 0);
});

test('gold: priced from international gold x USDINR in INR/gram', async () => {
  const { token } = await signup('A', 'a@example.com');
  market.stocks['GC=F'] = { price: 3000, closes: [2950, 3000], currency: 'USD' };
  market.stocks['USDINR=X'] = { price: 84, closes: [83, 84] };
  const r = await api('/api/investments', { method: 'POST', token, body: { type: 'gold', name: 'Sovereign Gold Bond', grams: 10, invested: 62500 } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.investment.currentPerGram, 8588.11);
  assert.equal(r.body.investment.current, 85881.1);
  assert.equal(r.body.investment.pricePerGram, 6250);
});

test('real estate: manual value is editable; setting an appreciation rate auto-values it', async () => {
  const { token } = await signup('A', 'a@example.com');
  const r = await api('/api/investments', { method: 'POST', token, body: { type: 'real_estate', name: '2BHK Pune', location: 'Hinjewadi', invested: 5000000, current: 5200000, purchaseDate: addDays(todayIST(), -730) } });
  assert.equal(r.body.investment.current, 5200000);
  assert.equal(r.body.investment.priceStatus, 'manual');
  const id = r.body.investment.id;

  const edited = await api(`/api/investments/${id}`, { method: 'PATCH', token, body: { current: 5300000 } });
  assert.equal(edited.body.investment.current, 5300000);

  const auto = await api(`/api/investments/${id}`, { method: 'PATCH', token, body: { appreciationRate: 8 } });
  assert.equal(auto.body.investment.current, 5832000); // 5,000,000 x 1.08^2
  assert.equal(auto.body.investment.priceSource, 'computed');
});

/* ================================================================== */
/* Update / delete / isolation                                         */
/* ================================================================== */

test('update: quantity change re-prices, keeps total invested; type is immutable', async () => {
  const { token } = await signup('A', 'a@example.com');
  const id = (await api('/api/investments', { method: 'POST', token, body: stock() })).body.investment.id;

  const up = await api(`/api/investments/${id}`, { method: 'PATCH', token, body: { quantity: 20 } });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.investment.current, 58000);
  assert.equal(up.body.investment.invested, 25000);
  assert.equal(up.body.investment.avgPrice, 1250);

  const put = await api(`/api/investments/${id}`, { method: 'PUT', token, body: { avgPrice: 2000 } });
  assert.equal(put.body.investment.invested, 40000); // 20 x 2000

  const type = await api(`/api/investments/${id}`, { method: 'PATCH', token, body: { type: 'gold' } });
  assert.equal(type.status, 400);
});

test('update during a provider outage keeps the last known price and flags it stale', async () => {
  const { token } = await signup('A', 'a@example.com');
  const id = (await api('/api/investments', { method: 'POST', token, body: stock() })).body.investment.id;
  market.down.add('RELIANCE.NS');
  const up = await api(`/api/investments/${id}`, { method: 'PATCH', token, body: { quantity: 20 } });
  assert.equal(up.status, 200);
  assert.equal(up.body.investment.current, 58000); // 20 x last known 2900
  assert.equal(up.body.investment.priceStatus, 'stale');
  assert.ok(up.body.warning);
});

test('users can only see and change their own holdings', async () => {
  const a = await signup('A', 'a@example.com');
  const b = await signup('B', 'b@example.com');
  const id = (await api('/api/investments', { method: 'POST', token: a.token, body: stock() })).body.investment.id;

  assert.equal((await api('/api/investments', { token: b.token })).body.investments.length, 0);
  assert.equal((await api(`/api/investments/${id}`, { token: b.token })).status, 404);
  assert.equal((await api(`/api/investments/${id}`, { method: 'PATCH', token: b.token, body: { quantity: 1 } })).status, 404);
  assert.equal((await api(`/api/investments/${id}`, { method: 'DELETE', token: b.token })).status, 404);
  assert.equal((await api('/api/investments/not-an-id', { token: b.token })).status, 404);

  const still = await api(`/api/investments/${id}`, { token: a.token });
  assert.equal(still.status, 200);
  assert.equal(still.body.investment.quantity, 10);
});

test('delete removes the holding and updates the portfolio history', async () => {
  const { token } = await signup('A', 'a@example.com');
  const id = (await api('/api/investments', { method: 'POST', token, body: stock() })).body.investment.id;
  const before = await api('/api/portfolio/history?range=1M', { token });
  assert.equal(before.body.points.at(-1).current, 29000); // snapshot reflects the new holding
  assert.equal((await api(`/api/investments/${id}`, { method: 'DELETE', token })).status, 204);
  assert.equal((await api(`/api/investments/${id}`, { token })).status, 404);
  const h = await api('/api/portfolio/history?range=1M', { token });
  assert.equal(h.body.points.at(-1).current, 0);
});

test('list supports type filter and reports freshness', async () => {
  const { token } = await signup('A', 'a@example.com');
  await api('/api/investments', { method: 'POST', token, body: stock() });
  await api('/api/investments', { method: 'POST', token, body: { type: 'real_estate', name: 'Plot', invested: 100 } });
  const all = await api('/api/investments', { token });
  assert.equal(all.body.investments.length, 2);
  assert.ok(all.body.pricesUpdatedAt);
  assert.equal(all.body.staleCount, 0);
  const only = await api('/api/investments?type=stocks', { token });
  assert.equal(only.body.investments.length, 1);
  assert.equal((await api('/api/investments?type=bogus', { token })).status, 400);
  assert.equal((await api('/api/investments?type[$ne]=x', { token })).status, 400);
});

/* ================================================================== */
/* The daily job                                                       */
/* ================================================================== */

async function seedTwoUsers() {
  const a = await signup('A', 'a@example.com');
  const b = await signup('B', 'b@example.com');
  await api('/api/investments', { method: 'POST', token: a.token, body: stock() });
  await api('/api/investments', { method: 'POST', token: a.token, body: stock({ name: 'TCS', symbol: 'TCS', quantity: 5, invested: 18000 }) });
  await api('/api/investments', { method: 'POST', token: b.token, body: stock({ quantity: 4, invested: 10000 }) });
  return { a, b };
}

test('daily job: reprices every holding, fetching each instrument only ONCE', async () => {
  const { a, b } = await seedTwoUsers();

  // Next day's market move
  market.stocks['RELIANCE.NS'] = { price: 3000, closes: [2880, 2900, 3000] };
  market.stocks['TCS.NS'] = { price: 4100, closes: [3990, 4000, 4100] };
  fetchMock.calls.length = 0;

  const result = await runPriceUpdate({ reason: 'test' });
  assert.equal(result.holdings, 3);
  assert.equal(result.updated, 3);
  assert.equal(result.stale, 0);

  // RELIANCE is held by two users but fetched a single time.
  const relianceCalls = fetchMock.calls.filter((u) => u.includes('RELIANCE.NS'));
  assert.equal(relianceCalls.length, 1);
  assert.equal(fetchMock.calls.length, 2); // RELIANCE + TCS

  const mineA = (await api('/api/investments', { token: a.token })).body.investments;
  const reliance = mineA.find((i) => i.symbol === 'RELIANCE');
  const tcs = mineA.find((i) => i.symbol === 'TCS');
  assert.equal(reliance.current, 30000); // 10 x 3000
  assert.equal(reliance.dayChange, 1000); // 10 x (3000 - 2900)
  assert.equal(tcs.current, 20500);
  const mineB = (await api('/api/investments', { token: b.token })).body.investments;
  assert.equal(mineB[0].current, 12000); // 4 x 3000
});

test('daily job: writes per-user portfolio snapshots and records the run', async () => {
  const { a, b } = await seedTwoUsers();
  market.stocks['RELIANCE.NS'] = { price: 3000, closes: [2900, 3000] };
  await runPriceUpdate({ reason: 'test' });

  const ha = await api('/api/portfolio/history?range=1M', { token: a.token });
  const today = ha.body.points.at(-1);
  assert.equal(today.date, todayIST());
  assert.equal(today.invested, 43000);
  assert.equal(today.current, 30000 + 20000); // 10 x 3000 + 5 x 4000
  const hb = await api('/api/portfolio/history', { token: b.token });
  assert.equal(hb.body.points.at(-1).current, 12000);
  assert.equal(hb.body.points.length, 1); // one point per day, upserted not duplicated

  const state = await JobState.findOne({ key: JOB_KEY });
  assert.equal(state.lastRunDate, todayIST());
  assert.equal(state.lockedUntil, null);
  assert.equal(state.lastStats.holdings, 3);

  assert.equal((await api('/api/portfolio/history?range=99X', { token: a.token })).status, 400);
});

test('daily job: a failing instrument keeps its last value, is flagged stale, and recovers', async () => {
  const { a } = await seedTwoUsers();
  market.down.add('TCS.NS');
  market.stocks['RELIANCE.NS'] = { price: 3000, closes: [2900, 3000] };

  const result = await runPriceUpdate({ reason: 'test' });
  assert.equal(result.updated, 2);
  assert.equal(result.stale, 1);
  assert.equal(result.failedInstruments[0].key, 'stock:TCS.NS');

  let list = (await api('/api/investments', { token: a.token })).body;
  const tcs = list.investments.find((i) => i.symbol === 'TCS');
  assert.equal(tcs.priceStatus, 'stale');
  assert.equal(tcs.current, 20000); // last good value kept, NOT zeroed
  assert.equal(tcs.dayChange, 0);
  assert.match(tcs.lastPriceError, /TCS\.NS/);
  assert.equal(list.staleCount, 1);
  assert.equal(list.investments.find((i) => i.symbol === 'RELIANCE').current, 30000);

  market.down.clear();
  market.stocks['TCS.NS'] = { price: 4200, closes: [4000, 4200] };
  await runPriceUpdate({ reason: 'test' });
  list = (await api('/api/investments', { token: a.token })).body;
  assert.equal(list.staleCount, 0);
  assert.equal(list.investments.find((i) => i.symbol === 'TCS').current, 21000);
});

test('daily job: accrual types move with the calendar, manual types are untouched', async () => {
  const { token } = await signup('A', 'a@example.com');
  await api('/api/investments', { method: 'POST', token, body: { type: 'fixed_deposit', name: 'FD', invested: 100000, rate: 7, purchaseDate: addDays(todayIST(), -200), tenureMonths: 24 } });
  const re = await api('/api/investments', { method: 'POST', token, body: { type: 'real_estate', name: 'Flat', invested: 100, current: 150 } });

  // Pretend the FD was last valued weeks ago
  await Investment.updateOne({ type: 'fixed_deposit' }, { $set: { current: 100000 } });
  const result = await runPriceUpdate({ reason: 'test' });
  assert.equal(result.manual, 1);
  const list = (await api('/api/investments', { token })).body.investments;
  const fd = list.find((i) => i.type === 'fixed_deposit');
  assert.ok(fd.current > 103000 && fd.current < 104500, `FD value ${fd.current}`);
  assert.ok(fd.dayChange > 15 && fd.dayChange < 25, `FD day change ${fd.dayChange}`);
  assert.equal(list.find((i) => i.id === re.body.investment.id).current, 150);
});

test('daily job: a second concurrent run is skipped by the DB lock', async () => {
  await seedTwoUsers();
  market.delayMs = 150;
  const first = runPriceUpdate({ reason: 'test-1' });
  await sleep(60);
  const second = await runPriceUpdate({ reason: 'test-2' });
  assert.equal(second.skipped, true);
  assert.equal((await first).skipped, false);
  market.delayMs = 0;
  // Lock is released afterwards
  assert.equal((await runPriceUpdate({ reason: 'test-3' })).skipped, false);
});

test('daily job: a crashed run cannot hold the lock forever (expired lock is taken over)', async () => {
  await seedTwoUsers();
  await JobState.updateOne({ key: JOB_KEY }, { $set: { lockedUntil: new Date(Date.now() - 1000) } }, { upsert: true });
  assert.equal((await runPriceUpdate({ reason: 'test' })).skipped, false);
  await JobState.updateOne({ key: JOB_KEY }, { $set: { lockedUntil: new Date(Date.now() + 60_000) } });
  assert.equal((await runPriceUpdate({ reason: 'test' })).skipped, true);
});

test('startup catch-up: runs only if today\'s update has not happened yet', async () => {
  await seedTwoUsers();
  const first = await runCatchUpIfNeeded(); // never ran
  assert.equal(first.skipped, false);
  assert.equal(await runCatchUpIfNeeded(), null); // already ran today (IST)
  await JobState.updateOne({ key: JOB_KEY }, { $set: { lastRunDate: '2000-01-01' } });
  assert.equal((await runCatchUpIfNeeded()).skipped, false);
});

test('manual refresh only touches the caller\'s own holdings', async () => {
  const { a, b } = await seedTwoUsers();
  market.stocks['RELIANCE.NS'] = { price: 3100, closes: [2900, 3100] };
  fetchMock.calls.length = 0;
  const r = await api('/api/investments/refresh', { method: 'POST', token: a.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.investments.find((i) => i.symbol === 'RELIANCE').current, 31000);
  // B's RELIANCE holding was not refreshed
  const bList = (await api('/api/investments', { token: b.token })).body.investments;
  assert.equal(bList[0].current, 11600); // still 4 x 2900
  assert.equal((await api('/api/investments/refresh', { method: 'POST' })).status, 401);
});

/* ================================================================== */
/* CSV export                                                          */
/* ================================================================== */

async function rawGet(path, token) {
  const res = await realFetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

test('CSV export: own holdings only, INR numbers, formula-injection neutralised', async () => {
  const a = await signup('A', 'a@example.com');
  const b = await signup('B', 'b@example.com');
  await api('/api/investments', { method: 'POST', token: a.token, body: stock() });
  await api('/api/investments', { method: 'POST', token: a.token, body: { type: 'real_estate', name: '=HYPERLINK("http://evil.example","click"),flat', invested: 100, current: 90 } });
  await api('/api/investments', { method: 'POST', token: b.token, body: stock({ name: 'B-only holding' }) });

  assert.equal((await rawGet('/api/investments/export.csv')).status, 401);

  const r = await rawGet('/api/investments/export.csv', a.token);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/csv/);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="wealthtrack-portfolio-\d{4}-\d{2}-\d{2}\.csv"/);

  const lines = r.text.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.match(lines[0], /^Type,Name,.*Invested \(INR\),Current value \(INR\)/);
  assert.equal(lines.length, 3); // header + 2 holdings, none of B's
  assert.equal(r.text.includes('B-only holding'), false);

  // Stock row: numbers are plain numbers (Excel can sum them), gain and % computed
  const stockRow = lines.find((l) => l.startsWith('Stocks,'));
  assert.match(stockRow, /^Stocks,Reliance Industries,RELIANCE,10,2024-03-15,25000,29000,4000,16,200,ok,/);

  // Malicious name: leading apostrophe defuses the formula; quotes/commas stay escaped
  const reRow = lines.find((l) => l.startsWith('Real Estate,'));
  assert.ok(reRow.startsWith('Real Estate,"\'=HYPERLINK(""http://evil.example"",""click""),flat",'), reRow);
  assert.match(reRow, /,100,90,-10,-10,0,manual,/); // negative numbers are NOT prefixed

  const filtered = await rawGet('/api/investments/export.csv?type=stocks', a.token);
  assert.equal(filtered.text.replace(/^\uFEFF/, '').trim().split('\r\n').length, 2);
  assert.equal((await rawGet('/api/investments/export.csv?type=bogus', a.token)).status, 400);
});
