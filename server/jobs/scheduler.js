import cron from 'node-cron';
import { JobState } from '../models/JobState.js';
import { JOB_KEY, runPriceUpdate } from '../services/priceUpdater.js';
import { todayIST } from '../utils/dates.js';

const TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_CRON = '30 23 * * *'; // 11:30 PM IST, every day

/**
 * If the server was down at the scheduled time (or this is a fresh deploy),
 * the day would otherwise be skipped. On boot, run the update when it has not
 * completed yet today (IST).
 */
export async function runCatchUpIfNeeded() {
  const state = await JobState.findOne({ key: JOB_KEY }).lean();
  if (state?.lastRunDate === todayIST()) return null;
  return runPriceUpdate({ reason: 'startup-catch-up' });
}

export function startScheduler() {
  const expression = process.env.PRICE_UPDATE_CRON || DEFAULT_CRON;
  if (!cron.validate(expression)) {
    throw new Error(`PRICE_UPDATE_CRON is not a valid cron expression: "${expression}"`);
  }

  const task = cron.schedule(
    expression,
    () => {
      runPriceUpdate({ reason: 'scheduled' }).catch((err) =>
        console.error('[prices] scheduled run failed:', err)
      );
    },
    { timezone: TIMEZONE }
  );
  console.log(`[prices] daily update scheduled: "${expression}" (${TIMEZONE})`);

  // Don't block startup on the network calls.
  runCatchUpIfNeeded().catch((err) => console.error('[prices] catch-up run failed:', err));

  return task;
}
