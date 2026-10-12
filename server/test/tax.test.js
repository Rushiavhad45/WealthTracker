import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySale } from '../services/tax/classify.js';
import { computeTax } from '../services/tax/engine.js';
import { buildAdvanceTax } from '../services/tax/advanceTax.js';
import { fyOf, parseFy } from '../utils/fy.js';

const S30 = { slabRate: 30, surchargePercent: 0 };
const sale = (o) => classifySale({ expenses: 0, ...o });
const eq = (o) => sale({ taxKind: 'listed_equity', ...o });
const tax = (rows, settings = S30) => computeTax(rows.map((r) => ({ taxClass: r.taxClass, gain: r.gain })), settings);

/* ---------------- financial-year helpers ---------------- */
test('financial year boundaries', () => {
  assert.equal(fyOf('2026-03-31'), '2025-26');
  assert.equal(fyOf('2026-04-01'), '2026-27');
  assert.equal(fyOf('2027-01-15'), '2026-27');
  assert.equal(parseFy('2026-27'), 2026);
  assert.equal(parseFy('2099-00'), 2099); // century roll-over is (2099+1)%100 = 0
  assert.equal(parseFy('2026-28'), null);
  assert.equal(parseFy('26-27'), null);
});

/* ---------------- classification ---------------- */
test('equity: "more than 12 months" - exactly 12 months is still short-term', () => {
  const base = { purchaseDate: '2025-01-15', saleAmount: 200, cost: 100 };
  assert.equal(eq({ ...base, saleDate: '2026-01-15' }).taxClass, 'EQ_STCG'); // 12 months exactly
  assert.equal(eq({ ...base, saleDate: '2026-01-16' }).taxClass, 'EQ_LTCG'); // 12 months + 1 day
  assert.equal(eq({ ...base, saleDate: '2026-01-16' }).term, 'long');
});

test('gain = sale value - expenses - cost', () => {
  const r = eq({ purchaseDate: '2023-01-10', saleDate: '2025-08-01', saleAmount: 300000, expenses: 500, cost: 100000 });
  assert.equal(r.gain, 199500);
  assert.equal(r.costUsed, 100000);
});

test('debt mutual fund bought on/after 1 Apr 2023 is ALWAYS short-term slab, however long held', () => {
  const r = sale({ taxKind: 'debt_mf', purchaseDate: '2023-05-01', saleDate: '2026-06-01', saleAmount: 200, cost: 100 });
  assert.equal(r.taxClass, 'SLAB_STCG');
  assert.equal(r.term, 'short');
});

test('debt mutual fund bought before 1 Apr 2023: long-term after 24 months at 12.5%', () => {
  assert.equal(sale({ taxKind: 'debt_mf', purchaseDate: '2022-01-01', saleDate: '2024-01-02', saleAmount: 2, cost: 1 }).taxClass, 'LT_OTHER'); // before cutoff of rules window is irrelevant for classification
  assert.equal(sale({ taxKind: 'debt_mf', purchaseDate: '2022-01-01', saleDate: '2025-06-01', saleAmount: 2, cost: 1 }).taxClass, 'LT_OTHER');
  assert.equal(sale({ taxKind: 'debt_mf', purchaseDate: '2022-12-01', saleDate: '2024-11-30', saleAmount: 2, cost: 1 }).taxClass, 'SLAB_STCG'); // 23.99 months
});

test('other asset holding periods: gold ETF 12m, physical gold / property / other MF 24m', () => {
  const at = (taxKind, purchaseDate, saleDate) => sale({ taxKind, purchaseDate, saleDate, saleAmount: 2, cost: 1 }).taxClass;
  assert.equal(at('gold_etf', '2024-08-01', '2025-09-01'), 'LT_OTHER');
  assert.equal(at('gold_physical', '2024-08-01', '2025-09-01'), 'SLAB_STCG'); // 13 months: not enough
  assert.equal(at('gold_physical', '2024-08-01', '2026-08-02'), 'LT_OTHER');
  assert.equal(at('property', '2024-08-01', '2026-08-02'), 'LT_OTHER');
  assert.equal(at('property', '2025-08-01', '2026-08-02'), 'SLAB_STCG');
  assert.equal(at('other_mf', '2024-08-01', '2026-08-02'), 'LT_OTHER');
  assert.equal(at('bond_listed', '2024-08-01', '2025-09-01'), 'LT_OTHER');
});

test('unlisted bonds are always short-term slab; SGB at maturity is exempt', () => {
  assert.equal(sale({ taxKind: 'bond_unlisted', purchaseDate: '2015-01-01', saleDate: '2025-01-01', saleAmount: 2, cost: 1 }).taxClass, 'SLAB_STCG');
  const sgb = sale({ taxKind: 'sgb_maturity', purchaseDate: '2018-01-01', saleDate: '2026-01-01', saleAmount: 200, cost: 100 });
  assert.equal(sgb.taxClass, 'EXEMPT');
  assert.equal(sgb.term, 'exempt');
  assert.equal(tax([sgb]).totalTax, 0); // ignored by the engine
});

/* ---------------- grandfathering (equity bought before 1 Feb 2018) ---------------- */
test('grandfathering: cost steps up to min(FMV on 31 Jan 2018, sale value)', () => {
  const base = { taxKind: 'listed_equity', purchaseDate: '2017-06-01', saleDate: '2025-06-01', saleAmount: 400000, cost: 100000 };
  const up = classifySale({ ...base, fmv31Jan2018: 250000 });
  assert.equal(up.costUsed, 250000);
  assert.equal(up.gain, 150000);
  assert.equal(up.method, 'grandfathered');

  // FMV above the sale price is capped at the sale price: no artificial loss
  const capped = classifySale({ ...base, fmv31Jan2018: 500000 });
  assert.equal(capped.costUsed, 400000);
  assert.equal(capped.gain, 0);

  // FMV below actual cost never lowers the cost
  assert.equal(classifySale({ ...base, fmv31Jan2018: 60000 }).costUsed, 100000);

  // missing FMV: actual cost used, with a warning
  const missing = classifySale(base);
  assert.equal(missing.gain, 300000);
  assert.match(missing.warnings.join(' '), /31 Jan 2018/);
});

/* ---------------- property: indexation option ---------------- */
test('property: 12.5% without indexation wins when indexation would not help (bought 2015)', () => {
  const r = sale({ taxKind: 'property', purchaseDate: '2015-06-01', saleDate: '2025-12-01', saleAmount: 12000000, expenses: 100000, cost: 5000000 });
  // plain: 6,900,000 x 12.5% = 862,500   indexed: cost 5,000,000 x 376/254 -> gain 4,498,425.20 x 20% = 899,685.04
  assert.equal(r.taxClass, 'LT_OTHER');
  assert.equal(r.gain, 6900000);
  assert.equal(r.method, 'standard');
});

test('property: 20% with indexation wins for an old property (bought 2005)', () => {
  const r = sale({ taxKind: 'property', purchaseDate: '2005-06-10', saleDate: '2025-12-01', saleAmount: 10000000, cost: 2000000 });
  // plain: 8,000,000 x 12.5% = 1,000,000   indexed: cost 2,000,000 x 376/117 = 6,427,350.43 -> 3,572,649.57 x 20% = 714,529.91
  assert.equal(r.taxClass, 'LT_INDEXED');
  assert.equal(r.method, 'indexed');
  assert.equal(r.costUsed, 6427350.43);
  assert.equal(r.gain, 3572649.57);
  assert.equal(tax([r]).totalTax, 743111.11); // 714,529.91 + 4% cess (28,581.20)
});

test('property bought on/after 23 Jul 2024 gets no indexation option', () => {
  const r = sale({ taxKind: 'property', purchaseDate: '2024-08-01', saleDate: '2026-09-01', saleAmount: 10000000, cost: 2000000 });
  assert.equal(r.taxClass, 'LT_OTHER');
  assert.equal(r.method, 'standard');
});

test('property sold in a year whose CII is not configured: warns and uses 12.5%', () => {
  const r = sale({ taxKind: 'property', purchaseDate: '2005-06-10', saleDate: '2026-08-01', saleAmount: 10000000, cost: 2000000 });
  assert.equal(r.taxClass, 'LT_OTHER');
  assert.match(r.warnings.join(' '), /Cost Inflation Index/);
});

/* ---------------- tax computation ---------------- */
test('equity LTCG: first ₹1.25 lakh exempt, rest at 12.5% + 4% cess', () => {
  const r = eq({ purchaseDate: '2023-01-10', saleDate: '2025-08-01', saleAmount: 300000, cost: 100000 }); // gain 200,000
  const t = tax([r]);
  assert.equal(t.exemptionUsed, 125000);
  assert.equal(t.exemptionRemaining, 0);
  assert.equal(t.basicTax, 9375); // 75,000 x 12.5%
  assert.equal(t.cess, 375);
  assert.equal(t.totalTax, 9750);
});

test('equity LTCG under the exemption is tax-free and reports the headroom left', () => {
  const t = tax([eq({ purchaseDate: '2023-01-10', saleDate: '2025-08-01', saleAmount: 200000, cost: 100000 })]);
  assert.equal(t.totalTax, 0);
  assert.equal(t.exemptionUsed, 100000);
  assert.equal(t.exemptionRemaining, 25000);
});

test('equity STCG is 20%; slab STCG uses the user rate; rupee rounding to nearest ₹10', () => {
  const stcg = eq({ purchaseDate: '2026-01-10', saleDate: '2026-06-01', saleAmount: 150000, cost: 100000 });
  assert.equal(tax([stcg]).totalTax, 10400); // 10,000 + 400
  const slab = sale({ taxKind: 'gold_physical', purchaseDate: '2026-01-10', saleDate: '2026-06-01', saleAmount: 200000, cost: 100000 });
  assert.equal(tax([slab], { slabRate: 30, surchargePercent: 0 }).totalTax, 31200);
  assert.equal(tax([slab], { slabRate: 10, surchargePercent: 0 }).totalTax, 10400);
  const odd = eq({ purchaseDate: '2026-01-10', saleDate: '2026-06-01', saleAmount: 112345, cost: 100000 }); // gain 12,345
  const t = tax([odd]);
  assert.equal(t.totalTax, 2567.76);
  assert.equal(t.payable, 2570);
});

test('surcharge: full on slab gains, capped at 15% on special-rate gains', () => {
  const slab = sale({ taxKind: 'gold_physical', purchaseDate: '2026-01-10', saleDate: '2026-06-01', saleAmount: 200000, cost: 100000 });
  assert.equal(tax([slab], { slabRate: 30, surchargePercent: 25 }).totalTax, 39000); // (30,000 + 7,500) x 1.04
  const stcg = eq({ purchaseDate: '2026-01-10', saleDate: '2026-06-01', saleAmount: 200000, cost: 100000 });
  assert.equal(tax([stcg], { slabRate: 30, surchargePercent: 25 }).totalTax, 23920); // (20,000 + 15% of 20,000) x 1.04
});

test('set-off: a short-term loss reduces long-term gains before the exemption', () => {
  const lt = eq({ purchaseDate: '2023-01-10', saleDate: '2025-08-01', saleAmount: 300000, cost: 100000 }); // +200,000
  const stLoss = sale({ taxKind: 'gold_physical', purchaseDate: '2026-01-10', saleDate: '2026-06-01', saleAmount: 50000, cost: 100000 }); // -50,000
  const t = tax([lt, stLoss]);
  assert.equal(t.exemptionUsed, 125000);
  assert.equal(t.basicTax, 3125); // (150,000 - 125,000) x 12.5%
  assert.equal(t.totalTax, 3250);
  assert.equal(t.carryForward.shortTerm, 0);
});

test('set-off: a long-term loss can NOT offset short-term gains, and is carried forward', () => {
  const stcg = eq({ purchaseDate: '2026-01-10', saleDate: '2026-06-01', saleAmount: 200000, cost: 100000 }); // +100,000 @20%
  const ltLoss = sale({ taxKind: 'gold_etf', purchaseDate: '2024-08-01', saleDate: '2026-06-01', saleAmount: 60000, cost: 100000 }); // -40,000 LT
  const t = tax([stcg, ltLoss]);
  assert.equal(t.totalTax, 20800); // no relief: 20,000 x 1.04
  assert.equal(t.carryForward.longTerm, 40000);
});

test('set-off: unabsorbed short-term loss is carried forward', () => {
  const stLoss = sale({ taxKind: 'gold_physical', purchaseDate: '2026-01-10', saleDate: '2026-06-01', saleAmount: 70000, cost: 100000 });
  const t = tax([stLoss]);
  assert.equal(t.totalTax, 0);
  assert.equal(t.carryForward.shortTerm, 30000);
});

test('set-off: LT loss is applied first so the flexible ST loss is preserved for carry-forward', () => {
  const rows = [
    { taxClass: 'LT_OTHER', gain: 100000 },
    { taxClass: 'EQ_LTCG', gain: -100000 }, // LT loss
    { taxClass: 'SLAB_STCG', gain: -100000 }, // ST loss
  ];
  const t = computeTax(rows, S30);
  assert.equal(t.totalTax, 0);
  assert.equal(t.carryForward.shortTerm, 100000);
  assert.equal(t.carryForward.longTerm, 0);
});

test('set-off: losses go against the highest-taxed gains first', () => {
  const rows = [
    { taxClass: 'EQ_STCG', gain: 100000 }, // 20%
    { taxClass: 'LT_OTHER', gain: 100000 }, // 12.5%
    { taxClass: 'SLAB_STCG', gain: -60000 },
  ];
  const t = computeTax(rows, S30);
  // loss hits the 20% gain: (40,000 x 20%) + (100,000 x 12.5%) = 8,000 + 12,500 = 20,500 -> x1.04
  assert.equal(t.basicTax, 20500);
  assert.equal(t.totalTax, 21320);
  assert.deepEqual(t.setOff, [{ lossTerm: 'short', against: 'EQ_STCG', amount: 60000 }]);
});

/* ---------------- advance tax ---------------- */
const stcgRow = (saleDate, gain) => ({ saleDate, taxClass: 'EQ_STCG', gain });

test('advance tax: tax on gains realised up to each due date; nothing due before the first gain', () => {
  const rows = [stcgRow('2026-06-20', 50000), stcgRow('2026-11-10', 30000)];
  const a = buildAdvanceTax({ startYear: 2026, rows, settings: { ...S30, advanceTaxPaid: 4000 }, today: '2026-09-19' });

  assert.deepEqual(a.schedule.map((s) => [s.dueDate, s.cumulativeDue, s.instalmentDue, s.status]), [
    ['2026-06-15', 0, 0, 'past'],
    ['2026-09-15', 10400, 10400, 'past'], // Jun-20 gain: 50,000 x 20% x 1.04
    ['2026-12-15', 16640, 6240, 'upcoming'], // + Nov-10 gain
    ['2027-03-15', 16640, 0, 'upcoming'],
  ]);
  assert.equal(a.taxOnGainsToDate, 10400);
  assert.equal(a.balanceNow, 6400); // 10,400 - 4,000 already paid
  assert.equal(a.nextDueDate, '2026-12-15');
  assert.equal(a.belowThreshold, false);
  assert.equal(a.fyEnded, false);
});

test('advance tax: gains after 15 March are due by 31 March', () => {
  const rows = [stcgRow('2026-06-20', 50000), stcgRow('2027-03-20', 10000)];
  const a = buildAdvanceTax({ startYear: 2026, rows, settings: S30, today: '2026-09-19' });
  const last = a.schedule.at(-1);
  assert.equal(last.dueDate, '2027-03-31');
  assert.equal(last.instalmentDue, 2080); // 10,000 x 20% x 1.04
});

test('advance tax: below ₹10,000 flagged; after year-end the unpaid balance is self-assessment tax', () => {
  const small = buildAdvanceTax({ startYear: 2026, rows: [stcgRow('2026-06-20', 20000)], settings: S30, today: '2026-09-19' });
  assert.equal(small.belowThreshold, true); // 4,160 total

  const done = buildAdvanceTax({ startYear: 2026, rows: [stcgRow('2026-06-20', 50000)], settings: { ...S30, advanceTaxPaid: 3000 }, today: '2027-05-01' });
  assert.equal(done.fyEnded, true);
  assert.equal(done.nextDueDate, null);
  assert.equal(done.selfAssessmentDue, 7400);

  // the balance uses the same ₹10-rounded figure as the headline (2,567.76 -> 2,570)
  const odd = buildAdvanceTax({ startYear: 2026, rows: [stcgRow('2026-06-20', 12345)], settings: S30, today: '2027-05-01' });
  assert.equal(odd.selfAssessmentDue, 2570);
});
