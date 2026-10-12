import mongoose from 'mongoose';

/**
 * A realised sale (booked profit / loss). Only FACTS are stored - dates, amounts
 * and the asset's tax subtype. Tax is recomputed from these when a report is
 * built, so a change in the rules in config/taxRules.js applies retroactively.
 */
const saleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    investment: { type: mongoose.Schema.Types.ObjectId, required: true }, // holding it was sold from
    fy: { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // e.g. 2026-27, from saleDate
    name: { type: String, required: true },
    type: { type: String, required: true }, // holding type
    symbol: String,
    schemeCode: String,
    taxKind: { type: String, required: true },

    unitField: { type: String }, // quantity | units | grams | undefined (whole-asset sale)
    quantity: { type: Number }, // amount sold, in unitField units
    purchaseDate: { type: String, required: true },
    saleDate: { type: String, required: true },
    saleAmount: { type: Number, required: true, min: 0 }, // total consideration received (INR)
    expenses: { type: Number, default: 0, min: 0 }, // brokerage / transfer costs (INR)
    cost: { type: Number, required: true, min: 0 }, // acquisition cost of the part sold (INR)
    fmv31Jan2018: { type: Number, min: 0 }, // total FMV of the part sold on 31 Jan 2018 (grandfathering)

    // For undo
    wasFullSale: { type: Boolean, required: true },
    soldCurrent: { type: Number, default: 0 },
    soldDayChange: { type: Number, default: 0 },
    holdingSnapshot: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

saleSchema.index({ user: 1, fy: 1, saleDate: 1 });

saleSchema.set('toJSON', {
  versionKey: false,
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.user;
    delete ret.holdingSnapshot;
    return ret;
  },
});

export const Sale = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
