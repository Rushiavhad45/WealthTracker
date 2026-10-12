import { Investment } from '../../models/Investment.js';
import { Sale } from '../../models/Sale.js';
import { TaxSettings } from '../../models/TaxSettings.js';
import { TAX_KINDS, TAX_RULES as R } from '../../config/taxRules.js';
import { fyBounds, fyLabel, fyOf, parseFy } from '../../utils/fy.js';
import { todayIST } from '../../utils/dates.js';
import { classifySale } from './classify.js';
import { computeTax } from './engine.js';
import { buildAdvanceTax } from './advanceTax.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const DISCLAIMER =
  'This is an ESTIMATE for a resident individual, based on the rules in config/taxRules.js. It is not tax advice. ' +
  'It does not cover your other income, the basic-exemption adjustment, sections 54/54EC/54F exemptions, brokerage or STT ' +
  'subtleties, or interest under 234B/234C. Confirm figures with a Chartered Accountant before paying or filing.';

export const DEFAULT_SETTINGS = { slabRate: 30, surchargePercent: 0, advanceTaxPaid: 0 };

export async function getSettings(userId, fy) {
  const doc = await TaxSettings.findOne({ user: userId, fy }).lean();
  if (!doc) return { ...DEFAULT_SETTINGS, isDefault: true };
  return {
    slabRate: doc.slabRate,
    surchargePercent: doc.surchargePercent,
    advanceTaxPaid: doc.advanceTaxPaid,
    isDefault: false,
  };
}

const KIND_FOR_MF = { equity: 'equity_mf', debt: 'debt_mf', other: 'other_mf' };

/** Ideas for lowering this year's tax, computed with the same engine as the report. */
async function planning({ userId, rows, settings, tax, today }) {
  const holdings = await Investment.find({ user: userId, type: { $in: ['stocks', 'mutual_fund'] } }).lean();
  const headroom = tax.exemptionRemaining;
  const gainCandidates = [];
  const lossCandidates = [];

  for (const h of holdings) {
    const taxKind = h.type === 'stocks' ? 'listed_equity' : KIND_FOR_MF[h.fundCategory];
    const qty = h.type === 'stocks' ? h.quantity : h.units;
    // grandfathered (pre-2018) lots need the 31-Jan-2018 price, so we don't guess for them
    if (!taxKind || !h.purchaseDate || !qty || h.purchaseDate < R.grandfatherCutoff) continue;

    const hypo = classifySale(
      { taxKind, purchaseDate: h.purchaseDate, saleDate: today, saleAmount: h.current, expenses: 0, cost: h.invested },
      R
    );

    if (hypo.taxClass === 'EQ_LTCG' && hypo.gain > 0 && headroom > 0) {
      const gainPerUnit = hypo.gain / qty;
      gainCandidates.push({
        id: String(h._id),
        name: h.name,
        unrealisedGain: hypo.gain,
        quantity: qty,
        unitsToUseExemption: Math.floor(Math.min(qty, headroom / gainPerUnit) * 1000) / 1000,
      });
    }

    if (hypo.gain < 0) {
      const withSale = computeTax([...rows, { taxClass: hypo.taxClass, gain: hypo.gain }], settings).totalTax;
      const saving = round2(tax.totalTax - withSale);
      if (saving > 0) {
        lossCandidates.push({
          id: String(h._id),
          name: h.name,
          unrealisedLoss: -hypo.gain,
          term: hypo.term,
          taxSaving: saving,
        });
      }
    }
  }

  gainCandidates.sort((a, b) => b.unrealisedGain - a.unrealisedGain);
  lossCandidates.sort((a, b) => b.taxSaving - a.taxSaving);
  return {
    ltcgExemptionRemaining: headroom,
    gainCandidates: gainCandidates.slice(0, 5),
    lossCandidates: lossCandidates.slice(0, 5),
    note:
      'Ideas only, priced with the same rules as this report. Selling has costs (brokerage, STT, exit loads) and changes your ' +
      'market exposure. Pre-2018 holdings are skipped because they need the 31 Jan 2018 price.',
  };
}

export async function buildTaxReport(userId, fy, { today = todayIST() } = {}) {
  const startYear = parseFy(fy);
  if (startYear == null) throw new Error('Invalid financial year');
  const { start, end } = fyBounds(startYear);

  const [sales, settings] = await Promise.all([
    Sale.find({ user: userId, fy }).sort({ saleDate: 1, createdAt: 1 }).lean(),
    getSettings(userId, fy),
  ]);

  const rows = sales.map((s) => ({
    saleId: String(s._id),
    name: s.name,
    type: s.type,
    symbol: s.symbol,
    quantity: s.quantity,
    taxKindLabel: TAX_KINDS[s.taxKind] || s.taxKind,
    ...classifySale(s, R),
  }));

  const tax = computeTax(rows, settings);
  const advanceTax = buildAdvanceTax({ startYear, rows, settings, today });

  const inFy = today >= start && today <= end;
  const plan = inFy ? await planning({ userId, rows, settings, tax, today }) : null;

  const warnings = [...new Set(rows.flatMap((r) => r.warnings))];
  if (settings.isDefault && rows.some((r) => r.taxClass === 'SLAB_STCG')) {
    warnings.unshift(`Some gains are taxed at your slab rate. You haven't set yours, so ${DEFAULT_SETTINGS.slabRate}% is assumed - set your actual rate above.`);
  }
  if (tax.carryForward.shortTerm > 0 || tax.carryForward.longTerm > 0) {
    warnings.push('Unabsorbed capital losses can be carried forward for 8 years, but ONLY if you file your ITR on or before the due date.');
  }

  return {
    fy,
    period: { start, end },
    rulesVersion: R.version,
    settings,
    sales: rows,
    summary: {
      saleCount: rows.length,
      totalSaleValue: round2(rows.reduce((s, r) => s + r.saleValue, 0)),
      totalCost: round2(rows.reduce((s, r) => s + r.costUsed, 0)),
      netGain: round2(rows.reduce((s, r) => s + r.gain, 0)),
      exemptGain: round2(rows.filter((r) => r.taxClass === 'EXEMPT').reduce((s, r) => s + r.gain, 0)),
    },
    tax,
    advanceTax,
    planning: plan,
    warnings,
    disclaimer: DISCLAIMER,
  };
}

export { fyLabel, fyOf };
