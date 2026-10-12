import { z } from 'zod';
import { addMonths, monthsBetween, todayIST } from '../utils/dates.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/* ---------- primitives ---------- */

// HTML forms send '' for blank inputs - treat as "not provided".
export const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);

export const optNumber = (schema) => z.preprocess(blankToUndefined, schema.optional());

export const positive = (label) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .positive(`${label} must be greater than 0`);

export const nonNegative = (label) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .min(0, `${label} cannot be negative`);

const requiredPositive = (label) =>
  z.preprocess(
    blankToUndefined,
    z
      .any()
      .refine((v) => v !== undefined, `${label} is required`)
      .pipe(positive(label))
  );

const text = (max = 120) => z.string().trim().max(max);
const optText = (max = 120) => z.preprocess(blankToUndefined, text(max).optional());
const requiredName = z.preprocess(
  blankToUndefined,
  z.string({ required_error: 'Name is required' }).trim().min(1, 'Name is required').max(120)
);

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be in YYYY-MM-DD format')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Invalid date');

const optDate = z.preprocess(blankToUndefined, isoDate.optional());
const notFuture = (s) => s <= todayIST();
const purchaseDate = z.preprocess(
  blankToUndefined,
  isoDate.refine(notFuture, 'Purchase date cannot be in the future').optional()
);
const requiredPurchaseDate = z.preprocess(
  blankToUndefined,
  z
    .string({ required_error: 'Purchase date is required' })
    .pipe(isoDate)
    .refine(notFuture, 'Purchase date cannot be in the future')
);

/* ---------- per-type schemas ---------- */

const stocks = z
  .object({
    type: z.literal('stocks'),
    name: optText(),
    symbol: z
      .string({ required_error: 'Stock symbol is required' })
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9&.-]{1,20}$/, 'Enter a valid NSE/BSE symbol, e.g. RELIANCE'),
    exchange: z.preprocess(
      (v) => (typeof v === 'string' && v ? v.toUpperCase() : undefined),
      z.enum(['NSE', 'BSE']).default('NSE')
    ),
    quantity: requiredPositive('Quantity'),
    invested: optNumber(positive('Amount invested')),
    avgPrice: optNumber(positive('Average price')),
    purchaseDate,
  })
  .refine((d) => d.invested != null || d.avgPrice != null, {
    message: 'Enter the amount invested (or your average buy price)',
    path: ['invested'],
  });

const mutualFund = z
  .object({
    type: z.literal('mutual_fund'),
    name: optText(),
    schemeCode: z.preprocess(
      (v) => (v == null ? v : String(v).trim()),
      z
        .string({ required_error: 'Select a mutual fund' })
        .regex(/^\d{3,10}$/, 'Select a fund from the search results (numeric scheme code required)')
    ),
    folio: optText(30),
    fundCategory: z.preprocess(blankToUndefined, z.enum(['equity', 'debt', 'other']).optional()),
    units: requiredPositive('Units'),
    invested: optNumber(positive('Amount invested')),
    avgNav: optNumber(positive('Average NAV')),
    sipAmount: optNumber(nonNegative('SIP amount')),
    sipDate: optNumber(z.coerce.number().int().min(1).max(31)),
    purchaseDate,
  })
  .refine((d) => d.invested != null || d.avgNav != null, {
    message: 'Enter the amount invested (or your average NAV)',
    path: ['invested'],
  });

const fixedDeposit = z
  .object({
    type: z.literal('fixed_deposit'),
    name: requiredName,
    bank: optText(),
    // `principal` is accepted as an alias for `invested`
    invested: requiredPositive('Principal'),
    rate: requiredPositive('Interest rate').pipe(z.number().max(30, 'Interest rate looks too high')),
    purchaseDate: requiredPurchaseDate,
    maturityDate: optDate,
    tenureMonths: optNumber(z.coerce.number().int().min(1).max(600)),
  })
  .refine((d) => d.maturityDate || d.tenureMonths, {
    message: 'Enter the maturity date (or the tenure in months)',
    path: ['maturityDate'],
  })
  .refine((d) => !d.maturityDate || d.maturityDate > d.purchaseDate, {
    message: 'Maturity date must be after the purchase date',
    path: ['maturityDate'],
  });

const gold = z.object({
  type: z.literal('gold'),
  name: requiredName,
  series: optText(),
  grams: requiredPositive('Weight (grams)'),
  invested: requiredPositive('Amount invested'),
  purity: optNumber(z.coerce.number().min(1).max(24)),
  maturityDate: optDate,
  purchaseDate,
});

const realEstate = z.object({
  type: z.literal('real_estate'),
  name: requiredName,
  location: optText(),
  area: optText(60),
  invested: requiredPositive('Purchase price'),
  current: optNumber(nonNegative('Current value')),
  // Optional: assumed yearly appreciation. If set, the value is grown daily.
  appreciationRate: optNumber(z.coerce.number().min(-50).max(100)),
  purchaseDate,
});

const bonds = z.object({
  type: z.literal('bonds'),
  name: requiredName,
  issuer: optText(),
  invested: requiredPositive('Amount invested'),
  current: optNumber(nonNegative('Current value')),
  faceValue: optNumber(positive('Face value')),
  quantity: optNumber(positive('Quantity')),
  couponRate: optNumber(nonNegative('Coupon rate').pipe(z.number().max(100))),
  maturityDate: optDate,
  purchaseDate,
});

const SCHEMAS = {
  stocks,
  mutual_fund: mutualFund,
  fixed_deposit: fixedDeposit,
  gold,
  real_estate: realEstate,
  bonds,
};

/* ---------- public API ---------- */

/** Validate a create/update payload. Throws ZodError (-> HTTP 400). */
export function parseInvestmentInput(input) {
  const schema = SCHEMAS[input?.type];
  if (!schema) {
    throw new z.ZodError([
      { code: 'custom', path: ['type'], message: `Investment type must be one of: ${Object.keys(SCHEMAS).join(', ')}` },
    ]);
  }
  // FD accepts `principal` as an alias of `invested`
  const normalised =
    input.type === 'fixed_deposit' && input.invested == null && input.principal != null
      ? { ...input, invested: input.principal }
      : input;
  return schema.parse(normalised);
}

const tenureLabel = (months) => {
  if (months % 12 === 0) {
    const y = months / 12;
    return `${y} Year${y === 1 ? '' : 's'}`;
  }
  return `${months} Month${months === 1 ? '' : 's'}`;
};

/**
 * Turn validated input into the fields stored on the document, filling in the
 * values the user should not have to type (average price, FD maturity, ...).
 */
export function deriveFields(data) {
  const purchase = data.purchaseDate || todayIST();

  switch (data.type) {
    case 'stocks': {
      const invested = data.invested ?? round2(data.quantity * data.avgPrice);
      return {
        type: 'stocks',
        name: data.name || data.symbol,
        symbol: data.symbol,
        exchange: data.exchange,
        quantity: data.quantity,
        invested: round2(invested),
        avgPrice: round2(invested / data.quantity),
        purchaseDate: purchase,
      };
    }

    case 'mutual_fund': {
      const invested = data.invested ?? round2(data.units * data.avgNav);
      return {
        type: 'mutual_fund',
        name: data.name, // may be filled from the fund's official name later
        schemeCode: data.schemeCode,
        folio: data.folio,
        fundCategory: data.fundCategory,
        units: data.units,
        invested: round2(invested),
        avgNav: round4(invested / data.units),
        sipAmount: data.sipAmount,
        sipDate: data.sipDate,
        purchaseDate: purchase,
      };
    }

    case 'fixed_deposit': {
      const maturityDate = data.maturityDate || addMonths(data.purchaseDate, data.tenureMonths);
      const months = data.tenureMonths || Math.max(1, monthsBetween(data.purchaseDate, maturityDate));
      return {
        type: 'fixed_deposit',
        name: data.name,
        bank: data.bank,
        invested: round2(data.invested),
        principal: round2(data.invested),
        rate: data.rate,
        tenure: tenureLabel(months),
        maturityDate,
        purchaseDate: data.purchaseDate,
      };
    }

    case 'gold':
      return {
        type: 'gold',
        name: data.name,
        series: data.series,
        grams: data.grams,
        purity: data.purity ?? 24,
        invested: round2(data.invested),
        pricePerGram: round2(data.invested / data.grams),
        maturityDate: data.maturityDate,
        purchaseDate: purchase,
      };

    case 'real_estate':
      return {
        type: 'real_estate',
        name: data.name,
        location: data.location,
        area: data.area,
        invested: round2(data.invested),
        current: round2(data.current ?? data.invested),
        appreciationRate: data.appreciationRate,
        purchaseDate: purchase,
      };

    case 'bonds':
      return {
        type: 'bonds',
        name: data.name,
        issuer: data.issuer,
        invested: round2(data.invested),
        current: round2(data.current ?? data.invested),
        faceValue: data.faceValue,
        quantity: data.quantity,
        couponRate: data.couponRate,
        maturityDate: data.maturityDate,
        purchaseDate: purchase,
      };

    default:
      throw new Error(`Unhandled investment type ${data.type}`);
  }
}

/* ---------- auth / profile ---------- */

const phoneRule = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s-]{6,17}$/, 'Enter a valid phone number');
const panRule = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must look like ABCDE1234F');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  // bcrypt only uses the first 72 bytes, so cap there rather than silently truncating
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
  phone: z.preprocess(blankToUndefined, phoneRule.optional()),
  pan: z.preprocess(blankToUndefined, panRule.optional()),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(200),
});

// Profile edits: every field optional; an empty string clears phone / PAN.
export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  phone: z.union([z.literal(''), phoneRule]).optional(),
  pan: z.union([z.literal(''), panRule]).optional(),
});
