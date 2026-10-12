import mongoose from 'mongoose';

/**
 * Bookkeeping for background jobs: when did the daily price update last run,
 * and a lock so two API instances never run it at the same time.
 */
const jobStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  lastRunDate: { type: String }, // IST date (YYYY-MM-DD) of the last completed run
  lastRunAt: { type: Date },
  lastStats: { type: mongoose.Schema.Types.Mixed },
  lockedUntil: { type: Date, default: null },
});

export const JobState = mongoose.models.JobState || mongoose.model('JobState', jobStateSchema);
