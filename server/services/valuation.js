/**
 * Pure valuation logic (no I/O) - turns a holding + a price quote (or just the
 * calendar) into the price-derived fields that get stored. All values are INR.
 *
 *  stocks / mutual_fund / gold : units x live price
 *  fixed_deposit               : cumulative FD, interest compounded quarterly
 *  bonds                       : invested + accrued coupon (needs faceValue, quantity, couponRate)
 *  real_estate                 : compounds at appreciationRate if set, otherwise manual
 */
import { addDays, daysBetween } from '../utils/dates.js';

export const LIVE_TYPES = ['stocks', 'mutual_fund', 'gold'];

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Years elapsed between two YYYY-MM-DD dates, never past the end date, never negative. */
function yearsElapsed(startDate, asOf, endDate) {
  if (!startDate) return 0;
  const end = endDate && endDate < asOf ? endDate : asOf;
  return Math.max(0, daysBetween(startDate, end)) / 365;
}

export function fixedDepositValue(inv, asOf) {
  const principal = inv.principal ?? inv.invested;
  const years = yearsElapsed(inv.purchaseDate, asOf, inv.maturityDate);
  // Indian bank FDs compound quarterly: A = P (1 + r/400)^(4t)
  return round2(principal * Math.pow(1 + Number(inv.rate || 0) / 400, 4 * years));
}

export function bondValue(inv, asOf) {
  const years = yearsElapsed(inv.purchaseDate, asOf, inv.maturityDate);
  const annualCoupon = (inv.faceValue * inv.quantity * inv.couponRate) / 100;
  return round2(inv.invested + annualCoupon * years);
}

export function realEstateValue(inv, asOf) {
  const years = yearsElapsed(inv.purchaseDate, asOf);
  return round2(inv.invested * Math.pow(1 + inv.appreciationRate / 100, years));
}

/** Value of an accrual-based holding on a given date, or null if it is priced manually. */
export function computedValue(inv, asOf) {
  switch (inv.type) {
    case 'fixed_deposit':
      return fixedDepositValue(inv, asOf);
    case 'bonds':
      return inv.faceValue > 0 && inv.quantity > 0 && inv.couponRate > 0
        ? bondValue(inv, asOf)
        : null;
    case 'real_estate':
      return inv.appreciationRate != null ? realEstateValue(inv, asOf) : null;
    default:
      return null;
  }
}

const dayChangeOf = (units, price, previousPrice) =>
  previousPrice != null ? round2(units * (price - previousPrice)) : 0;

/**
 * Fields to $set for a fresh valuation. `quote` is required for live types.
 * Returns null when the holding is manually valued (nothing to update).
 */
export function valuate(inv, quote, { asOf, now = new Date() }) {
  const fresh = { lastPriceAt: now, lastPriceError: null, priceStatus: 'ok' };

  switch (inv.type) {
    case 'stocks': {
      const previous = quote.previousPrice ?? null;
      return {
        ...fresh,
        priceSource: 'live',
        currentPrice: quote.price,
        previousPrice: previous,
        current: round2(inv.quantity * quote.price),
        dayChange: dayChangeOf(inv.quantity, quote.price, previous),
      };
    }

    case 'mutual_fund': {
      const previous = quote.previousPrice ?? null;
      return {
        ...fresh,
        priceSource: 'live',
        nav: quote.price,
        currentPrice: quote.price,
        previousPrice: previous,
        current: round2(inv.units * quote.price),
        dayChange: dayChangeOf(inv.units, quote.price, previous),
      };
    }

    case 'gold': {
      // quote.price is 24K INR/gram; scale for purity (22K => 22/24).
      const factor = (inv.purity ?? 24) / 24;
      const perGram = round2(quote.price * factor);
      // Day change uses unrounded per-gram prices so paise-rounding doesn't leak into it.
      const prevExact = quote.previousPrice != null ? quote.previousPrice * factor : null;
      return {
        ...fresh,
        priceSource: 'live',
        currentPrice: quote.price,
        previousPrice: quote.previousPrice ?? null,
        currentPerGram: perGram,
        current: round2(inv.grams * perGram),
        dayChange: dayChangeOf(inv.grams, quote.price * factor, prevExact),
      };
    }

    default: {
      const today = computedValue(inv, asOf);
      if (today == null) return null; // manual
      const yesterday = computedValue(inv, addDays(asOf, -1));
      return {
        ...fresh,
        priceSource: 'computed',
        current: today,
        dayChange: round2(today - yesterday),
      };
    }
  }
}

/**
 * The price feed failed. Keep the last known value (never zero it out), flag it,
 * and report no day change since we do not know one.
 */
export function markStale(inv, message) {
  return {
    priceStatus: inv.lastPriceAt ? 'stale' : 'pending',
    lastPriceError: String(message || 'Price unavailable').slice(0, 300),
    dayChange: 0,
  };
}
