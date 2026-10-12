import { Investment } from '../models/Investment.js';
import { Sale } from '../models/Sale.js';
import { TaxSettings } from '../models/TaxSettings.js';
import { TAX_RULES as R } from '../config/taxRules.js';
import { sellSchema } from '../validators/tax.js';
import { recordSnapshots } from './snapshots.js';
import { fyOf } from '../utils/fy.js';
import { todayIST } from '../utils/dates.js';
import { httpError } from '../utils/httpError.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const EPS = 1e-9;

/** Which field counts "how much" of a holding there is (undefined => the asset is sold whole). */
function unitFieldOf(h) {
  if (h.type === 'stocks') return 'quantity';
  if (h.type === 'mutual_fund') return 'units';
  if (h.type === 'gold') return 'grams';
  if (h.type === 'bonds' && h.quantity > 0) return 'quantity';
  return undefined;
}

function taxKindOf(h, input) {
  switch (h.type) {
    case 'stocks':
      return 'listed_equity';
    case 'mutual_fund': {
      const cat = input.fundCategory ?? h.fundCategory;
      if (!cat) throw httpError(400, 'Choose the fund category (equity, debt or other) - it decides how the gain is taxed');
      return { equity: 'equity_mf', debt: 'debt_mf', other: 'other_mf' }[cat];
    }
    case 'gold': {
      if (!input.goldForm) throw httpError(400, 'Choose the gold type (physical, ETF, or SGB) - it decides how the gain is taxed');
      return { physical: 'gold_physical', etf: 'gold_etf', sgb_maturity: 'sgb_maturity', sgb_exchange: 'sgb_exchange' }[input.goldForm];
    }
    case 'real_estate':
      return 'property';
    case 'bonds': {
      if (!input.bondListing) throw httpError(400, 'Say whether the bond is listed or unlisted - it decides how the gain is taxed');
      return input.bondListing === 'listed' ? 'bond_listed' : 'bond_unlisted';
    }
    default:
      throw httpError(400, 'This investment type cannot be sold here');
  }
}

/**
 * Record a sale (full or partial) of a holding the user owns.
 * The holding is claimed atomically FIRST, so two simultaneous requests can't sell the same units twice.
 */
export async function sellInvestment(userId, holdingDoc, rawInput) {
  const h = holdingDoc.toObject();
  if (h.type === 'fixed_deposit') {
    throw httpError(400, 'Fixed deposit interest is not a capital gain (it is taxed at your slab rate as interest income). Delete the FD when it matures.');
  }

  const input = sellSchema.parse(rawInput);
  const field = unitFieldOf(h);
  const total = field ? h[field] : 1;

  if (input.quantity != null && !field) throw httpError(400, 'This asset can only be sold in full');
  const qty = input.quantity ?? total;
  if (qty > total + EPS) throw httpError(400, `You only hold ${total}`);
  const whole = qty >= total - EPS;

  const today = todayIST();
  if (input.saleDate < R.minSaleDate) {
    throw httpError(400, `Tax is calculated for sales on or after ${R.minSaleDate} (the current rules). Earlier sales are not supported.`);
  }
  if (input.saleDate > today) throw httpError(400, 'Sale date cannot be in the future');
  const purchaseDate = input.purchaseDate ?? h.purchaseDate;
  if (!purchaseDate) throw httpError(400, 'Enter the purchase date - it decides whether the gain is short-term or long-term');
  if (purchaseDate > today) throw httpError(400, 'Purchase date cannot be in the future');
  if (input.saleDate < purchaseDate) throw httpError(400, 'Sale date cannot be before the purchase date');

  let saleAmount = input.saleAmount;
  if (saleAmount == null && input.salePricePerUnit != null && field) saleAmount = round2(input.salePricePerUnit * qty);
  if (saleAmount == null) throw httpError(400, field ? 'Enter the sale price per unit or the total amount received' : 'Enter the total amount received');

  const taxKind = taxKindOf(h, input);
  const cost = whole ? h.invested : round2((h.invested * qty) / total);
  const factor = qty / total;
  const soldCurrent = whole ? h.current : round2(h.current * factor);
  const soldDayChange = whole ? h.dayChange || 0 : round2((h.dayChange || 0) * factor);
  const fmvTotal = input.fmv31Jan2018PerUnit != null ? round2(input.fmv31Jan2018PerUnit * qty) : undefined;

  // ---- claim the units atomically ----
  const guard = { _id: h._id, user: userId };
  if (field) guard[field] = { $gte: qty - EPS };
  let remaining = null;
  if (whole) {
    const gone = await Investment.findOneAndDelete(guard);
    if (!gone) throw httpError(409, 'This holding changed while you were selling. Refresh and try again.');
  } else {
    remaining = await Investment.findOneAndUpdate(guard, { $inc: { [field]: -qty, invested: -cost } }, { new: true });
    if (!remaining) throw httpError(409, 'This holding changed while you were selling. Refresh and try again.');
  }

  let sale;
  try {
    sale = await Sale.create({
      user: userId,
      investment: h._id,
      fy: fyOf(input.saleDate),
      name: h.name,
      type: h.type,
      symbol: h.symbol,
      schemeCode: h.schemeCode,
      taxKind,
      unitField: field,
      quantity: field ? qty : undefined,
      purchaseDate,
      saleDate: input.saleDate,
      saleAmount,
      expenses: input.expenses ?? 0,
      cost,
      fmv31Jan2018: fmvTotal,
      wasFullSale: whole,
      soldCurrent,
      soldDayChange,
      holdingSnapshot: h,
    });
  } catch (err) {
    // put the holding back so nothing is lost
    if (whole) await Investment.collection.insertOne(h).catch(() => {});
    else await Investment.updateOne({ _id: h._id }, { $inc: { [field]: qty, invested: cost } });
    throw err;
  }

  if (!whole) {
    await Investment.updateOne(
      { _id: h._id },
      {
        $set: {
          [field]: round6(remaining[field]),
          invested: round2(remaining.invested),
          current: round2(h.current - soldCurrent),
          dayChange: round2((h.dayChange || 0) - soldDayChange),
        },
      }
    );
  }
  await recordSnapshots([userId]);

  const holding = whole ? null : await Investment.findById(h._id);
  return { sale, holding };
}

/** Reverse a sale that was entered by mistake: put the units (and their cost) back. */
export async function undoSale(userId, saleId) {
  const sale = await Sale.findOne({ _id: saleId, user: userId });
  if (!sale) throw httpError(404, 'Sale not found');

  const existing = await Investment.findOne({ _id: sale.investment, user: userId });
  if (existing && sale.unitField) {
    await Investment.updateOne(
      { _id: existing._id },
      {
        $inc: {
          [sale.unitField]: sale.quantity,
          invested: sale.cost,
          current: sale.soldCurrent,
          dayChange: sale.soldDayChange,
        },
      }
    );
  } else if (!existing) {
    // Rebuild the holding from its snapshot (same id), sized to what was sold
    const restored = { ...sale.holdingSnapshot, invested: sale.cost, current: sale.soldCurrent, dayChange: sale.soldDayChange };
    if (sale.unitField) restored[sale.unitField] = sale.quantity;
    await Investment.collection.insertOne(restored);
  } else {
    throw httpError(409, 'Cannot undo: the holding has changed since this sale');
  }

  await sale.deleteOne();
  await recordSnapshots([userId]);
}

export async function saveTaxSettings(userId, fy, updates) {
  const doc = await TaxSettings.findOneAndUpdate(
    { user: userId, fy },
    { $set: updates, $setOnInsert: { user: userId, fy } },
    { new: true, upsert: true }
  );
  return doc;
}
