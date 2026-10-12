import { Investment } from '../models/Investment.js';
import { deriveFields, parseInvestmentInput } from '../validators/investment.js';
import { PriceError, quoteRequestFor } from './prices.js';
import { markStale, valuate } from './valuation.js';
import { recordSnapshots } from './snapshots.js';
import { todayIST } from '../utils/dates.js';
import { httpError } from '../utils/httpError.js';

// Fields the client may never set directly; they are always derived server-side.
const SERVER_OWNED = [
  '_id', 'id', 'user', '__v', 'createdAt', 'updatedAt',
  'current', 'dayChange', 'currentPrice', 'previousPrice', 'nav', 'currentPerGram',
  'priceSource', 'priceStatus', 'lastPriceAt', 'lastPriceError',
];

// For these types `current` is a value the user enters (unless auto-valued from
// coupon / appreciation data), so it is NOT server-owned.
const MANUAL_CURRENT_TYPES = ['real_estate', 'bonds'];
const serverOwnedFor = (type) =>
  MANUAL_CURRENT_TYPES.includes(type) ? SERVER_OWNED.filter((k) => k !== 'current') : SERVER_OWNED;

export const WARNING_PRICE_PENDING =
  'Live price is temporarily unavailable. The value will refresh automatically on the next daily update.';

/**
 * Work out price-derived fields for a holding that is being saved.
 * - not_found / unsupported  -> user typed a bad symbol/fund: reject (400)
 * - provider outage          -> still save it; keep the prior price if we have one
 */
async function priceFields(fields, prior) {
  const asOf = todayIST();
  const now = new Date();
  const req = quoteRequestFor(fields);

  // Accrual / manual types
  if (!req) {
    const set = valuate(fields, null, { asOf, now });
    if (set) return { ...set };
    return {
      current: fields.current ?? fields.invested,
      dayChange: 0,
      priceSource: 'manual',
      priceStatus: 'manual',
    };
  }

  try {
    const quote = await req.fetch();
    const set = valuate(fields, quote, { asOf, now });
    // MF: adopt the fund's official name if the user did not type one.
    if (fields.type === 'mutual_fund' && !fields.name) set.name = quote.schemeName;
    return set;
  } catch (err) {
    if (err instanceof PriceError && (err.kind === 'not_found' || err.kind === 'unsupported')) {
      throw httpError(400, err.message);
    }
    if (!(err instanceof PriceError)) throw err;

    // Provider unavailable: fall back to the last known price, else the invested amount.
    const sameInstrument = prior && quoteRequestFor(prior)?.key === req.key;
    if (sameInstrument && prior.currentPrice != null) {
      const set = valuate(fields, { price: prior.currentPrice, previousPrice: prior.previousPrice }, { asOf, now });
      return { ...set, ...markStale({ lastPriceAt: prior.lastPriceAt }, err.message), lastPriceAt: prior.lastPriceAt };
    }
    return {
      current: fields.invested,
      dayChange: 0,
      priceSource: 'live',
      ...markStale({}, err.message),
    };
  }
}

const warningFor = (doc) =>
  doc.priceSource === 'live' && doc.priceStatus !== 'ok' ? WARNING_PRICE_PENDING : undefined;

export async function createInvestment(userId, input) {
  const fields = deriveFields(parseInvestmentInput(input));
  const priced = await priceFields(fields, null);
  if (!fields.name && !priced.name) throw httpError(400, 'Name is required');

  const doc = await Investment.create({ user: userId, ...fields, ...priced });
  await recordSnapshots([userId]);
  return { investment: doc, warning: warningFor(doc) };
}

/**
 * Merge a partial update onto the stored holding and re-validate the whole
 * thing, so an edit can never leave a holding in an invalid state.
 */
export async function updateInvestment(doc, patch) {
  if (patch.type && patch.type !== doc.type) {
    throw httpError(400, 'Investment type cannot be changed. Delete it and add a new one.');
  }

  const existing = doc.toObject();
  const owned = serverOwnedFor(doc.type);
  const cleanPatch = { ...patch };
  for (const key of owned) delete cleanPatch[key];
  delete cleanPatch.type;

  const merged = { ...existing };
  for (const key of owned) delete merged[key];

  // Editing one side of a pair must win over the stale derived side.
  if ('avgPrice' in cleanPatch && !('invested' in cleanPatch)) delete merged.invested;
  if ('avgNav' in cleanPatch && !('invested' in cleanPatch)) delete merged.invested;
  if ('tenureMonths' in cleanPatch && !('maturityDate' in cleanPatch)) delete merged.maturityDate;

  const fields = deriveFields(parseInvestmentInput({ ...merged, ...cleanPatch, type: doc.type }));
  const priced = await priceFields(fields, existing);

  doc.set({ ...fields, ...priced });
  await doc.save();
  await recordSnapshots([doc.user]);
  return { investment: doc, warning: warningFor(doc) };
}

export async function deleteInvestment(doc) {
  const userId = doc.user;
  await doc.deleteOne();
  await recordSnapshots([userId]);
}

export function listInvestments(userId, type) {
  const filter = { user: userId };
  if (type) filter.type = type;
  return Investment.find(filter).sort({ createdAt: -1 });
}
