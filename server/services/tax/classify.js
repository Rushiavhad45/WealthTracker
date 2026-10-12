import { TAX_RULES as R } from '../../config/taxRules.js';
import { addMonths, monthsBetween } from '../../utils/dates.js';
import { fyStartYear } from '../../utils/fy.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Held for MORE than N months: sold strictly after the N-month anniversary. */
const heldMoreThan = (purchaseDate, saleDate, months) => saleDate > addMonths(purchaseDate, months);

/**
 * Turn the recorded FACTS of a sale into a tax classification + gain.
 *
 * sale: { taxKind, purchaseDate, saleDate, saleAmount, expenses, cost, fmv31Jan2018 }
 *
 * taxClass is one of: EQ_STCG | EQ_LTCG | SLAB_STCG | LT_OTHER | LT_INDEXED | EXEMPT
 */
export function classifySale(sale, rules = R) {
  const notes = [];
  const warnings = [];
  const { taxKind, purchaseDate, saleDate } = sale;
  const saleAmount = Number(sale.saleAmount);
  const expenses = Number(sale.expenses || 0);
  const cost = Number(sale.cost);
  const netConsideration = saleAmount - expenses;

  let taxClass;
  let method = 'standard';
  let costUsed = cost;

  const longTerm = (months) => heldMoreThan(purchaseDate, saleDate, months);

  switch (taxKind) {
    case 'listed_equity':
    case 'equity_mf':
      taxClass = longTerm(rules.equity.longTermMonths) ? 'EQ_LTCG' : 'EQ_STCG';
      break;

    case 'debt_mf':
      if (purchaseDate >= rules.debtFundCutoff) {
        taxClass = 'SLAB_STCG';
        notes.push('Debt fund bought on/after 1 Apr 2023: gain is always short-term and taxed at your slab rate (s.50AA).');
      } else {
        taxClass = longTerm(rules.longTermMonths.unlisted) ? 'LT_OTHER' : 'SLAB_STCG';
      }
      break;

    case 'other_mf':
      taxClass = longTerm(rules.longTermMonths.unlisted) ? 'LT_OTHER' : 'SLAB_STCG';
      if (purchaseDate >= rules.debtFundCutoff && saleDate < '2025-04-01') {
        warnings.push('Gold/international fund bought after 1 Apr 2023 and sold before 1 Apr 2025 may have been taxed at slab rate under the older "specified mutual fund" definition. Check with a CA.');
      }
      break;

    case 'gold_etf':
    case 'sgb_exchange':
      taxClass = longTerm(rules.longTermMonths.listed) ? 'LT_OTHER' : 'SLAB_STCG';
      break;

    case 'gold_physical':
      taxClass = longTerm(rules.longTermMonths.unlisted) ? 'LT_OTHER' : 'SLAB_STCG';
      break;

    case 'sgb_maturity':
      taxClass = 'EXEMPT';
      notes.push('SGB redeemed at maturity is exempt for individuals. (Buyers from the secondary market may not qualify - verify.)');
      break;

    case 'bond_listed':
      taxClass = longTerm(rules.longTermMonths.listed) ? 'LT_OTHER' : 'SLAB_STCG';
      break;

    case 'bond_unlisted':
      taxClass = 'SLAB_STCG';
      notes.push('Unlisted bonds/debentures sold on/after 23 Jul 2024: gain is always short-term, taxed at slab rate (s.50AA).');
      break;

    case 'property':
      taxClass = longTerm(rules.longTermMonths.unlisted) ? 'LT_OTHER' : 'SLAB_STCG';
      break;

    default:
      throw new Error(`Unknown taxKind "${taxKind}"`);
  }

  // Grandfathering (equity bought before 1 Feb 2018), long-term only
  if (taxClass === 'EQ_LTCG' && purchaseDate < rules.grandfatherCutoff) {
    if (sale.fmv31Jan2018 != null) {
      costUsed = Math.max(cost, Math.min(Number(sale.fmv31Jan2018), saleAmount));
      method = 'grandfathered';
      notes.push('Cost stepped up to the 31 Jan 2018 value (grandfathering).');
    } else {
      warnings.push('Bought before 1 Feb 2018: add the 31 Jan 2018 price when selling, otherwise your actual cost is used and the tax may be overstated.');
    }
  }

  let gain = round2(netConsideration - costUsed);

  // Property bought before 23 Jul 2024: choose the cheaper of 12.5% (no indexation) / 20% (indexed)
  if (taxKind === 'property' && taxClass === 'LT_OTHER' && purchaseDate < rules.indexationCutoff) {
    const saleCii = rules.cii[fyStartYear(saleDate)];
    const buyCii = rules.cii[Math.max(2001, fyStartYear(purchaseDate))];
    if (saleCii == null) {
      warnings.push('Indexation option not evaluated: the Cost Inflation Index for this financial year is not configured yet, so tax is shown at 12.5% without indexation (possibly higher than you will actually owe).');
    } else if (buyCii != null) {
      const indexedCost = round2((cost * saleCii) / buyCii);
      const indexedGain = round2(netConsideration - indexedCost);
      const taxPlain = Math.max(0, gain) * (rules.ltcgRate / 100);
      const taxIndexed = Math.max(0, indexedGain) * (rules.indexedRate / 100);
      if (indexedGain > 0 && taxIndexed < taxPlain) {
        taxClass = 'LT_INDEXED';
        method = 'indexed';
        costUsed = indexedCost;
        gain = indexedGain;
        notes.push(`Indexed cost used (CII ${buyCii} → ${saleCii}), taxed at 20% - lower than 12.5% without indexation.`);
      } else {
        notes.push('12.5% without indexation is cheaper than 20% with indexation for this sale.');
      }
    }
    if (purchaseDate < '2001-04-01') {
      warnings.push('Property bought before 1 Apr 2001: use its 1 Apr 2001 fair value as the cost. Indexation assumes the cost you entered is that value.');
    }
  }

  const term = taxClass === 'EXEMPT' ? 'exempt' : ['EQ_LTCG', 'LT_OTHER', 'LT_INDEXED'].includes(taxClass) ? 'long' : 'short';

  return {
    taxKind,
    taxClass,
    term,
    method,
    purchaseDate,
    saleDate,
    holdingMonths: Math.max(0, monthsBetween(purchaseDate, saleDate)),
    saleValue: round2(saleAmount),
    expenses: round2(expenses),
    cost: round2(cost),
    costUsed: round2(costUsed),
    gain,
    notes,
    warnings,
  };
}
