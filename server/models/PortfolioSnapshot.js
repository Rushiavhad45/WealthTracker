import mongoose from 'mongoose';

/** One row per user per day (IST) - powers the portfolio growth chart. */
const snapshotSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    invested: { type: Number, required: true },
    current: { type: Number, required: true },
  },
  { timestamps: true }
);

snapshotSchema.index({ user: 1, date: 1 }, { unique: true });

export const PortfolioSnapshot =
  mongoose.models.PortfolioSnapshot || mongoose.model('PortfolioSnapshot', snapshotSchema);
