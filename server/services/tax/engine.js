import { TAX_RULES as R } from '../../config/taxRules.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const TAX_CLASSES = {
  EQ_STCG: { term: 'ST', label: 'Short-term: listed equity / equity funds', exemption: false },
  SLAB_STCG: { term: 'ST', label: 'Short-term: taxed at slab rate', exemption: false },
  LT_INDEXED: { term: 'LT', label: 'Long-term: property, with indexation', exemption: false },
  LT_OTHER: { term: 'LT', label: 'Long-term: other assets (no indexation)', exemption: false },
  EQ_LTCG: { term: 'LT', label: 'Long-term: listed equity / equity funds', exemption: true },
};

export function rateOf(taxClass, settings) {
  switch (taxClass) {
    case 'EQ_STCG': return R.equity.stcgRate;
    case 'EQ_LTCG': return R.equity.ltcgRate;
    case 'LT_OTHER': return R.ltcgRate;
    case 'LT_INDEXED': return R.indexedRate;
    case 'SLAB_STCG': return Number(settings.slabRate);
    default: throw new Error(`No rate for ${taxClass}`);
  }
}

const roundToNearest = (n, step) => Math.round(n / step) * step;

/**
 * Net the gains, apply loss set-off and the ₹1.25L exemption, and compute tax.
 *
 * rows: [{ taxClass, gain }]   (EXEMPT rows are ignored)
 * settings: { slabRate, surchargePercent }
 *
 * Set-off rules (Income-tax Act ss.70-71):
 *  - a long-term loss can only be set off against long-term gains;
 *  - a short-term loss can be set off against short-term OR long-term gains.
 * Losses are applied to the highest-taxed gains first (best outcome for the
 * taxpayer). LT losses go first so the more flexible ST loss is preserved for
 * carry-forward whenever it is not needed this year.
 */
export function computeTax(rows, settings) {
  const classes = Object.keys(TAX_CLASSES);
  const net = Object.fromEntries(classes.map((c) => [c, 0]));
  for (const r of rows) if (r.taxClass !== 'EXEMPT') net[r.taxClass] += r.gain;
  for (const c of classes) net[c] = round2(net[c]);

  const remaining = Object.fromEntries(classes.map((c) => [c, Math.max(0, net[c])]));
  let stLoss = 0;
  let ltLoss = 0;
  for (const c of classes) {
    if (net[c] < 0) (TAX_CLASSES[c].term === 'ST' ? (stLoss -= net[c]) : (ltLoss -= net[c]));
  }

  // highest rate first; among equal rates the exemption-eligible class goes last
  const order = [...classes].sort(
    (a, b) => rateOf(b, settings) - rateOf(a, settings) || Number(TAX_CLASSES[a].exemption) - Number(TAX_CLASSES[b].exemption)
  );

  const setOff = [];
  const absorb = (pool, lossTerm, candidates) => {
    let left = pool;
    for (const c of candidates) {
      if (left <= 0) break;
      const use = Math.min(left, remaining[c]);
      if (use > 0) {
        remaining[c] = round2(remaining[c] - use);
        left = round2(left - use);
        setOff.push({ lossTerm, against: c, amount: round2(use) });
      }
    }
    return left;
  };
  const ltLeft = absorb(ltLoss, 'long', order.filter((c) => TAX_CLASSES[c].term === 'LT'));
  const stLeft = absorb(stLoss, 'short', order);

  const exemptionUsed = round2(Math.min(R.equity.ltcgExemption, remaining.EQ_LTCG));
  const taxable = { ...remaining, EQ_LTCG: round2(remaining.EQ_LTCG - exemptionUsed) };

  const surcharge = Number(settings.surchargePercent || 0);
  const lines = classes.map((c) => {
    const rate = rateOf(c, settings);
    const base = round2((taxable[c] * rate) / 100);
    const sPct = c === 'SLAB_STCG' ? surcharge : Math.min(surcharge, R.surchargeCapSpecialRate);
    return {
      taxClass: c,
      label: TAX_CLASSES[c].label,
      term: TAX_CLASSES[c].term,
      rate,
      netGain: net[c],
      afterSetOff: remaining[c],
      taxableGain: taxable[c],
      tax: base,
      surcharge: round2((base * sPct) / 100),
    };
  });

  const basicTax = round2(lines.reduce((s, l) => s + l.tax, 0));
  const surchargeAmt = round2(lines.reduce((s, l) => s + l.surcharge, 0));
  const cess = round2(((basicTax + surchargeAmt) * R.cessPercent) / 100);
  const total = round2(basicTax + surchargeAmt + cess);

  return {
    lines,
    setOff,
    exemptionUsed,
    exemptionRemaining: round2(R.equity.ltcgExemption - exemptionUsed),
    carryForward: { shortTerm: round2(stLeft), longTerm: round2(ltLeft) },
    basicTax,
    surcharge: surchargeAmt,
    cess,
    totalTax: total,
    payable: roundToNearest(total, R.roundTaxToNearest),
  };
}
