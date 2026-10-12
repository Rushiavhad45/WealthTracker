import { mfApiPayload, mockFetch, realFetch, yahooChart } from './helpers.js'; // first: sets env
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { Investment, PortfolioSnapshot, Sale, TaxSettings, User } from '../models/index.js';
import { buildTaxReport } from '../services/tax/report.js';

const DB = process.env.TEST_MONGODB_URI_TAX || 'mongodb://127.0.0.1:27017/invest-tracker-test-tax';

const STOCKS = {
  'RELIANCE.NS': { price: 2900, closes: [2850, 2880, 2900] },
  'TCS.NS': { price: 4000, closes: [3950, 3990, 4000] },
  'INFY.NS': { price: 1500, closes: [1490, 1495, 1500] },
  'GC=F': { price: 3000, closes: [2950, 3000], currency: 'USD' },
  'USDINR=X': { price: 84, closes: [83, 84] },
};
let fetchMock;
let server;
let base;

const handler = async (url) => {
  if (url.includes('finance/chart/')) {
    const t = decodeURIComponent(url.split('/chart/')[1].split('?')[0]);
    const s = STOCKS[t];
    return s ? { body: yahooChart({ symbol: t, ...s }) } : { status: 404, body: {} };
  }
  const m = /mfapi\.in\/mf\/(\d+)$/.exec(url);
  if (m) return { body: mfApiPayload({ navs: [['18-09-2026', 70], ['17-09-2026', 69.5]] }) };
  throw new Error(`unexpected request ${url}`);
};

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await realFetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers, text };
}

async function signup(email) {
  const r = await api('/api/auth/register', { method: 'POST', body: { name: 'T', email, password: 'correct-horse-9' } });
  return { token: r.body.token, id: r.body.user.id };
}

const addStock = (token, o = {}) =>
  api('/api/investments', { method: 'POST', token, body: { type: 'stocks', symbol: 'RELIANCE', quantity: 10, invested: 25000, purchaseDate: '2024-03-15', ...o } });

before(async () => {
  await connectDb(DB);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  fetchMock = mockFetch(handler);
});
beforeEach(async () => {
  await Promise.all([User, Investment, PortfolioSnapshot, Sale, TaxSettings].map((m) => m.deleteMany({})));
});
after(async () => {
  fetchMock.restore();
  await new Promise((r) => server.close(r));
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});

/* ---------------- selling ---------------- */

test('partial sale: books the gain on the sold part, keeps the rest with proportional cost', async () => {
  const { token } = await signup('a@example.com');
  const id = (await addStock(token)).body.investment.id; // 10 sh, cost 25,000 (₹2,500 avg), now 29,000

  const r = await api(`/api/investments/${id}/sell`, { method: 'POST', token, body: { quantity: 4, salePricePerUnit: 3000, saleDate: '2025-09-01', expenses: 50 } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.sale.saleAmount, 12000);
  assert.equal(r.body.sale.cost, 10000);
  assert.equal(r.body.sale.fy, '2025-26');
  assert.equal(r.body.sale.taxKind, 'listed_equity');
  assert.equal(r.body.sale.holdingSnapshot, undefined); // internal, never returned

  const h = r.body.holding;
  assert.equal(h.quantity, 6);
  assert.equal(h.invested, 15000);
  assert.equal(h.current, 17400); // 6 x 2,900
  assert.equal(h.avgPrice, 2500); // average buy price unchanged by a sale

  const rep = (await api('/api/tax/report?fy=2025-26', { token })).body;
  assert.equal(rep.sales.length, 1);
  assert.equal(rep.sales[0].gain, 1950); // 12,000 - 50 - 10,000
  assert.equal(rep.sales[0].taxClass, 'EQ_LTCG'); // held ~17 months
  assert.equal(rep.tax.totalTax, 0); // inside the ₹1.25L exemption
  assert.equal(rep.tax.exemptionRemaining, 123050);
});

test('full sale removes the holding; portfolio history reflects it', async () => {
  const { token } = await signup('a@example.com');
  const id = (await addStock(token)).body.investment.id;
  const r = await api(`/api/investments/${id}/sell`, { method: 'POST', token, body: { saleAmount: 30000, saleDate: '2025-09-01' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.holding, null);
  assert.equal(r.body.sale.quantity, 10);
  assert.equal(r.body.sale.cost, 25000);
  assert.equal((await api(`/api/investments/${id}`, { token })).status, 404);
  assert.equal((await api('/api/portfolio/history?range=1M', { token })).body.points.at(-1).current, 0);
});

test('sell validation: dates, quantity, amounts, unsupported types', async () => {
  const { token } = await signup('a@example.com');
  const id = (await addStock(token)).body.investment.id;
  const sell = (body) => api(`/api/investments/${id}/sell`, { method: 'POST', token, body });

  assert.match((await sell({ saleAmount: 1, saleDate: '2024-07-22' })).body.message, /on or after 2024-07-23/);
  assert.match((await sell({ saleAmount: 1, saleDate: '2999-01-01' })).body.message, /future/);
  const late = (await addStock(token, { purchaseDate: '2025-06-01' })).body.investment.id;
  const early = await api(`/api/investments/${late}/sell`, { method: 'POST', token, body: { saleAmount: 1, saleDate: '2025-05-01' } });
  assert.match(early.body.message, /before the purchase date/);
  assert.match((await sell({ quantity: 11, saleAmount: 1, saleDate: '2025-09-01' })).body.message, /only hold 10/);
  assert.match((await sell({ saleDate: '2025-09-01' })).body.message, /sale price per unit or the total/);
  assert.equal((await sell({ quantity: 0, saleAmount: 5, saleDate: '2025-09-01' })).status, 400);
  assert.equal((await sell({ saleAmount: 5 })).status, 400); // no date
  assert.equal((await Sale.countDocuments()), 0);
  assert.equal((await api(`/api/investments/${id}`, { token })).body.investment.quantity, 10); // untouched

  const fd = (await api('/api/investments', { method: 'POST', token, body: { type: 'fixed_deposit', name: 'FD', invested: 1000, rate: 7, purchaseDate: '2025-01-01', tenureMonths: 12 } })).body.investment;
  const r = await api(`/api/investments/${fd.id}/sell`, { method: 'POST', token, body: { saleAmount: 1100, saleDate: '2025-09-01' } });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /interest income/);
});

test('the tax subtype is required where it changes the tax (mutual fund, gold, bonds)', async () => {
  const { token } = await signup('a@example.com');
  const mf = (await api('/api/investments', { method: 'POST', token, body: { type: 'mutual_fund', schemeCode: '122639', units: 100, invested: 6000, purchaseDate: '2024-03-01' } })).body.investment;
  const sellMf = (body) => api(`/api/investments/${mf.id}/sell`, { method: 'POST', token, body: { saleAmount: 8000, saleDate: '2025-09-01', ...body } });
  assert.match((await sellMf({})).body.message, /fund category/);
  const ok = await sellMf({ fundCategory: 'equity', quantity: 40 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.sale.taxKind, 'equity_mf');
  assert.equal(ok.body.holding.units, 60);
  assert.equal(ok.body.holding.invested, 3600);

  const bond = (await api('/api/investments', { method: 'POST', token, body: { type: 'bonds', name: 'B', invested: 100000 } })).body.investment;
  const bd = { saleAmount: 90000, saleDate: '2025-09-01', purchaseDate: '2020-01-01' };
  const r = await api(`/api/investments/${bond.id}/sell`, { method: 'POST', token, body: bd });
  assert.match(r.body.message, /listed or unlisted/);
  const partial = await api(`/api/investments/${bond.id}/sell`, { method: 'POST', token, body: { ...bd, bondListing: 'unlisted', quantity: 1 } });
  assert.match(partial.body.message, /only be sold in full/);
});

test('purchase date can be corrected at sale time (a holding entered with today\'s default date would look short-term)', async () => {
  const { token, id: userId } = await signup('a@example.com');
  // entered without a purchase date -> defaults to today, which is wrong for an old holding
  const h = (await api('/api/investments', { method: 'POST', token, body: { type: 'stocks', symbol: 'RELIANCE', quantity: 10, invested: 25000 } })).body.investment;

  const blocked = await api(`/api/investments/${h.id}/sell`, { method: 'POST', token, body: { saleAmount: 30000, saleDate: '2025-09-01' } });
  assert.match(blocked.body.message, /before the purchase date/); // cannot silently mis-date it

  const ok = await api(`/api/investments/${h.id}/sell`, { method: 'POST', token, body: { saleAmount: 30000, saleDate: '2025-09-01', purchaseDate: '2023-01-10' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.sale.purchaseDate, '2023-01-10');
  const rep = await buildTaxReport(userId, '2025-26', { today: '2026-09-19' });
  assert.equal(rep.sales[0].taxClass, 'EQ_LTCG'); // classified with the corrected date

  const future = await addStock(token);
  assert.equal((await api(`/api/investments/${future.body.investment.id}/sell`, { method: 'POST', token, body: { saleAmount: 1, saleDate: '2025-09-01', purchaseDate: '2999-01-01' } })).status, 400);
});

test('a stored fund category is remembered on the holding and used at sale time', async () => {
  const { token } = await signup('a@example.com');
  const mf = (await api('/api/investments', { method: 'POST', token, body: { type: 'mutual_fund', schemeCode: '122639', units: 10, invested: 600, fundCategory: 'debt', purchaseDate: '2024-03-01' } })).body.investment;
  assert.equal(mf.fundCategory, 'debt');
  const r = await api(`/api/investments/${mf.id}/sell`, { method: 'POST', token, body: { saleAmount: 900, saleDate: '2025-09-01' } });
  assert.equal(r.body.sale.taxKind, 'debt_mf');
});

test('two simultaneous full sales of the same holding: exactly one wins (no double-booking)', async () => {
  const { token } = await signup('a@example.com');
  const id = (await addStock(token)).body.investment.id;
  const body = { saleAmount: 30000, saleDate: '2025-09-01' };
  const results = await Promise.all([1, 2, 3].map(() => api(`/api/investments/${id}/sell`, { method: 'POST', token, body })));
  const statuses = results.map((r) => r.status).sort();
  assert.equal(statuses.filter((s) => s === 201).length, 1, JSON.stringify(statuses));
  assert.equal(await Sale.countDocuments(), 1);
});

/* ---------------- ownership ---------------- */

test('users cannot sell, undo, or see each other\'s sales', async () => {
  const a = await signup('a@example.com');
  const b = await signup('b@example.com');
  const id = (await addStock(a.token)).body.investment.id;
  assert.equal((await api(`/api/investments/${id}/sell`, { method: 'POST', token: b.token, body: { saleAmount: 1, saleDate: '2025-09-01' } })).status, 404);

  const sale = (await api(`/api/investments/${id}/sell`, { method: 'POST', token: a.token, body: { saleAmount: 30000, saleDate: '2025-09-01' } })).body.sale;
  assert.equal((await api(`/api/tax/sales/${sale.id}`, { method: 'DELETE', token: b.token })).status, 404);
  assert.equal((await api('/api/tax/report?fy=2025-26', { token: b.token })).body.sales.length, 0);
  assert.equal((await api('/api/tax/report?fy=2025-26', { token: a.token })).body.sales.length, 1);
});

/* ---------------- undo ---------------- */

test('undo a partial sale restores quantity, cost and value', async () => {
  const { token } = await signup('a@example.com');
  const id = (await addStock(token)).body.investment.id;
  const sale = (await api(`/api/investments/${id}/sell`, { method: 'POST', token, body: { quantity: 4, salePricePerUnit: 3000, saleDate: '2025-09-01' } })).body.sale;

  assert.equal((await api(`/api/tax/sales/${sale.id}`, { method: 'DELETE', token })).status, 204);
  const h = (await api(`/api/investments/${id}`, { token })).body.investment;
  assert.equal(h.quantity, 10);
  assert.equal(h.invested, 25000);
  assert.equal(h.current, 29000);
  assert.equal((await api('/api/tax/report?fy=2025-26', { token })).body.sales.length, 0);
  assert.equal((await api(`/api/tax/sales/${sale.id}`, { method: 'DELETE', token })).status, 404); // already undone
});

test('undo a full sale recreates the holding with the same id', async () => {
  const { token } = await signup('a@example.com');
  const id = (await addStock(token)).body.investment.id;
  const sale = (await api(`/api/investments/${id}/sell`, { method: 'POST', token, body: { saleAmount: 30000, saleDate: '2025-09-01' } })).body.sale;
  assert.equal((await api(`/api/tax/sales/${sale.id}`, { method: 'DELETE', token })).status, 204);
  const h = (await api(`/api/investments/${id}`, { token })).body.investment;
  assert.equal(h.quantity, 10);
  assert.equal(h.invested, 25000);
  assert.equal(h.symbol, 'RELIANCE');
  assert.equal((await api('/api/investments', { token })).body.investments.length, 1);
});

/* ---------------- report, settings, csv ---------------- */

test('settings: slab rate drives short-term non-equity tax; input is validated and per-FY', async () => {
  const { token } = await signup('a@example.com');
  const gold = (await api('/api/investments', { method: 'POST', token, body: { type: 'gold', name: 'Gold coin', grams: 10, invested: 60000, purchaseDate: '2025-06-01' } }));
  // GC=F isn't mocked -> saved as pending, which is fine for a sale
  assert.equal(gold.status, 201);
  const sale = await api(`/api/investments/${gold.body.investment.id}/sell`, { method: 'POST', token, body: { saleAmount: 100000, saleDate: '2025-10-01', goldForm: 'physical' } });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));

  let rep = (await api('/api/tax/report?fy=2025-26', { token })).body;
  assert.equal(rep.settings.isDefault, true);
  assert.match(rep.warnings.join(' '), /30% is assumed/);
  assert.equal(rep.tax.totalTax, 12480); // 40,000 x 30% x 1.04

  rep = (await api('/api/tax/settings/2025-26', { method: 'PUT', token, body: { slabRate: 20, advanceTaxPaid: 5000 } })).body;
  assert.equal(rep.settings.slabRate, 20);
  assert.equal(rep.settings.isDefault, false);
  assert.equal(rep.tax.totalTax, 8320); // 40,000 x 20% x 1.04
  assert.equal(rep.advanceTax.paid, 5000);
  assert.equal(rep.advanceTax.selfAssessmentDue, 3320); // FY over: 8,320 - 5,000
  assert.equal(rep.warnings.some((w) => /assumed/.test(w)), false);

  assert.equal((await api('/api/tax/settings/2025-26', { method: 'PUT', token, body: { slabRate: 45 } })).status, 400);
  assert.equal((await api('/api/tax/settings/2025-26', { method: 'PUT', token, body: { advanceTaxPaid: -1 } })).status, 400);
  assert.equal((await api('/api/tax/settings/2026-28', { method: 'PUT', token, body: { slabRate: 10 } })).status, 400);
  // a different year keeps its own (default) settings
  assert.equal((await api('/api/tax/report?fy=2024-25', { token })).body.settings.isDefault, true);
});

test('report input validation and auth', async () => {
  const { token } = await signup('a@example.com');
  assert.equal((await api('/api/tax/report')).status, 401);
  assert.equal((await api('/api/tax/report?fy=2026-28', { token })).status, 400);
  const def = await api('/api/tax/report', { token }); // defaults to the current FY
  assert.equal(def.status, 200);
  assert.match(def.body.fy, /^\d{4}-\d{2}$/);
  assert.match(def.body.disclaimer, /not tax advice/);
});

test('planning: unused ₹1.25L exemption and loss-harvesting savings, priced by the same engine', async () => {
  const { token, id: userId } = await signup('a@example.com');

  // A: bought 1 May 2026, sold 1 Aug 2026 for a ₹9,000 short-term gain
  const a = (await addStock(token, { symbol: 'RELIANCE', quantity: 10, invested: 20000, purchaseDate: '2026-05-01' })).body.investment;
  await api(`/api/investments/${a.id}/sell`, { method: 'POST', token, body: { saleAmount: 29000, saleDate: '2026-08-01' } });
  // B: open short-term holding sitting on a ₹10,000 loss (cost 50,000, worth 40,000)
  await addStock(token, { symbol: 'TCS', quantity: 10, invested: 50000, purchaseDate: '2026-03-01' });
  // C: long-term holding with a ₹10,000 gain (cost 20,000, worth 30,000)
  await addStock(token, { symbol: 'INFY', quantity: 20, invested: 20000, purchaseDate: '2024-01-10' });

  const rep = await buildTaxReport(userId, '2026-27', { today: '2026-09-19' });
  assert.equal(rep.tax.totalTax, 1872); // 9,000 x 20% x 1.04
  assert.equal(rep.tax.exemptionRemaining, 125000);

  const p = rep.planning;
  assert.equal(p.ltcgExemptionRemaining, 125000);
  assert.equal(p.gainCandidates.length, 1);
  assert.equal(p.gainCandidates[0].name, 'INFY');
  assert.equal(p.gainCandidates[0].unrealisedGain, 10000);
  assert.equal(p.gainCandidates[0].unitsToUseExemption, 20); // all 20 fit inside ₹1.25L

  assert.equal(p.lossCandidates.length, 1);
  assert.equal(p.lossCandidates[0].name, 'TCS');
  assert.equal(p.lossCandidates[0].unrealisedLoss, 10000);
  assert.equal(p.lossCandidates[0].taxSaving, 1872); // the loss wipes out the ₹9,000 gain

  // a past year gets no planning section
  assert.equal((await buildTaxReport(userId, '2025-26', { today: '2026-09-19' })).planning, null);
});

test('CSV statement: per-sale rows, summary, and injection-safe names', async () => {
  const { token } = await signup('a@example.com');
  const id = (await addStock(token, { name: '=cmd|calc' })).body.investment.id;
  await api(`/api/investments/${id}/sell`, { method: 'POST', token, body: { saleAmount: 30000, saleDate: '2025-09-01' } });

  assert.equal((await api('/api/tax/report.csv?fy=2025-26')).status, 401);
  const r = await api('/api/tax/report.csv?fy=2025-26', { token });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/csv/);
  assert.match(r.headers.get('content-disposition'), /wealthtrack-capital-gains-2025-26\.csv/);
  const lines = r.text.replace(/^\uFEFF/, '').split('\r\n');
  assert.match(lines[0], /Capital gains statement - FY 2025-26/);
  const row = lines.find((l) => l.includes("'=cmd|calc"));
  assert.ok(row, 'sale row present with formula neutralised');
  assert.match(row, /,2024-03-15,2025-09-01,\d+,10,30000,0,25000,25000,5000,long,EQ_LTCG$/);
  assert.match(r.text, /Estimated tax payable \(INR\)/);
});
