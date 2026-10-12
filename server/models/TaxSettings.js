import mongoose from 'mongoose';

/** Per user, per financial year inputs to the tax estimate. */
const taxSettingsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fy: { type: String, required: true },
    slabRate: { type: Number, min: 0, max: 30, default: 30 }, // marginal income-tax slab (%)
    surchargePercent: { type: Number, min: 0, max: 37, default: 0 },
    advanceTaxPaid: { type: Number, min: 0, default: 0 }, // advance tax + TDS already paid for capital gains
  },
  { timestamps: true }
);
taxSettingsSchema.index({ user: 1, fy: 1 }, { unique: true });

export const TaxSettings = mongoose.models.TaxSettings || mongoose.model('TaxSettings', taxSettingsSchema);
