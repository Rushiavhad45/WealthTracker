import mongoose from 'mongoose';

export const INVESTMENT_TYPES = [
  'stocks',
  'mutual_fund',
  'fixed_deposit',
  'gold',
  'real_estate',
  'bonds',
];

/**
 * One document per holding. The user enters a holding ONCE (quantity/units,
 * amount invested, ...) and the daily job keeps the price-derived fields
 * (currentPrice, current, dayChange, ...) up to date. All money is in INR.
 */
const investmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: INVESTMENT_TYPES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    purchaseDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ }, // YYYY-MM-DD (IST calendar date)

    // Money (INR)
    invested: { type: Number, required: true, min: 0 },
    current: { type: Number, required: true, min: 0 },
    dayChange: { type: Number, default: 0 },

    // Stocks
    symbol: { type: String, uppercase: true, trim: true },
    exchange: { type: String, enum: ['NSE', 'BSE'] },
    quantity: { type: Number, min: 0 },
    avgPrice: { type: Number, min: 0 },

    // Mutual funds
    schemeCode: { type: String, trim: true },
    folio: { type: String, trim: true },
    // equity (65%+ domestic equity) | debt (65%+ debt) | other (hybrid, international, gold FoF) - drives tax treatment
    fundCategory: { type: String, enum: ['equity', 'debt', 'other'] },
    units: { type: Number, min: 0 },
    avgNav: { type: Number, min: 0 },
    nav: { type: Number, min: 0 },
    sipAmount: { type: Number, min: 0 },
    sipDate: { type: Number, min: 1, max: 31 },

    // Latest market price (stock price / NAV / 24K gold per gram) + the previous close
    currentPrice: { type: Number, min: 0 },
    previousPrice: { type: Number, min: 0 },

    // Fixed deposit
    bank: { type: String, trim: true },
    principal: { type: Number, min: 0 },
    rate: { type: Number, min: 0 }, // % p.a.
    tenure: { type: String, trim: true }, // display label, e.g. "3 Years"
    maturityDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },

    // Gold
    grams: { type: Number, min: 0 },
    purity: { type: Number, min: 1, max: 24 }, // karat
    pricePerGram: { type: Number, min: 0 }, // buy price / gram
    currentPerGram: { type: Number, min: 0 },
    series: { type: String, trim: true },

    // Real estate
    location: { type: String, trim: true },
    area: { type: String, trim: true },
    appreciationRate: { type: Number }, // % p.a., optional; enables daily auto-valuation

    // Bonds
    issuer: { type: String, trim: true },
    faceValue: { type: Number, min: 0 },
    couponRate: { type: Number, min: 0 },

    // Pricing metadata
    priceSource: { type: String, enum: ['live', 'computed', 'manual'], default: 'manual' },
    // ok: fresh | stale: last refresh failed, showing older value | pending: never priced | manual
    priceStatus: { type: String, enum: ['ok', 'stale', 'pending', 'manual'], default: 'manual' },
    lastPriceAt: { type: Date },
    lastPriceError: { type: String },
  },
  { timestamps: true }
);

investmentSchema.index({ user: 1, createdAt: -1 });
investmentSchema.index({ user: 1, type: 1 });

investmentSchema.set('toJSON', {
  versionKey: false,
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.user;
    return ret;
  },
});

export const Investment =
  mongoose.models.Investment || mongoose.model('Investment', investmentSchema);
