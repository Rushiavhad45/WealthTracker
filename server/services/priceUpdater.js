import { Investment } from '../models/Investment.js';
import { JobState } from '../models/JobState.js';
import { quoteRequestFor } from './prices.js';
import { markStale, valuate } from './valuation.js';
import { recordSnapshots } from './snapshots.js';
import { todayIST } from '../utils/dates.js';

export const JOB_KEY = 'daily-price-update';
const LOCK_TTL_MS = 30 * 60 * 1000;
const FETCH_CONCURRENCY = 4;
const WRITE_BATCH = 500;

/** Run fn over items with at most `limit` in flight. */
async function mapLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Cross-instance lock stored in MongoDB, so scaling the API to several
 * instances (each running the scheduler) still updates prices once.
 */
async function acquireLock(now = new Date()) {
  await JobState.updateOne({ key: JOB_KEY }, { $setOnInsert: { key: JOB_KEY } }, { upsert: true });
  const locked = await JobState.findOneAndUpdate(
    { key: JOB_KEY, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
    { $set: { lockedUntil: new Date(now.getTime() + LOCK_TTL_MS) } },
    { new: true }
  );
  return Boolean(locked);
}

async function releaseLock() {
  await JobState.updateOne({ key: JOB_KEY }, { $set: { lockedUntil: null } });
}

/**
 * Refresh prices for every holding (or only one user's when `userId` is given).
 *
 * Each unique instrument (a stock, a fund, gold) is fetched ONCE and shared by
 * all holdings that reference it, so N users owning RELIANCE cost 1 API call.
 * A failed fetch never wipes a holding: it keeps its last value and is flagged
 * `stale` until a later run succeeds.
 */
export async function runPriceUpdate({ reason = 'manual', userId = null, now = new Date() } = {}) {
  const scoped = Boolean(userId);
  if (!scoped && !(await acquireLock(now))) {
    console.log(`[prices] ${reason}: another run is in progress, skipping`);
    return { skipped: true, reason: 'already-running' };
  }

  const asOf = todayIST(now);
  const filter = scoped ? { user: userId } : {};
  const started = Date.now();

  try {
    // Pass 1: which distinct instruments do we need quotes for?
    const requests = new Map();
    for await (const inv of Investment.find(filter, 'type symbol exchange schemeCode').lean().cursor()) {
      const req = quoteRequestFor(inv);
      if (req && !requests.has(req.key)) requests.set(req.key, req);
    }

    // Fetch each one once, a few at a time.
    const quotes = new Map();
    await mapLimit([...requests.values()], FETCH_CONCURRENCY, async (req) => {
      try {
        quotes.set(req.key, { quote: await req.fetch() });
      } catch (err) {
        quotes.set(req.key, { error: err.message });
      }
    });

    // Pass 2: compute new values and write them in batches.
    const stats = { holdings: 0, updated: 0, stale: 0, manual: 0, instruments: requests.size, failedInstruments: [] };
    for (const [key, q] of quotes) if (q.error) stats.failedInstruments.push({ key, error: q.error });

    let ops = [];
    const flush = async () => {
      if (!ops.length) return;
      await Investment.bulkWrite(ops, { ordered: false });
      ops = [];
    };

    for await (const inv of Investment.find(filter).lean().cursor()) {
      stats.holdings += 1;
      const req = quoteRequestFor(inv);
      let set;
      if (req) {
        const q = quotes.get(req.key);
        set = q?.quote ? valuate(inv, q.quote, { asOf, now }) : markStale(inv, q?.error);
        if (q?.quote) stats.updated += 1;
        else stats.stale += 1;
      } else {
        set = valuate(inv, null, { asOf, now });
        if (set) stats.updated += 1;
        else stats.manual += 1;
      }
      if (set) ops.push({ updateOne: { filter: { _id: inv._id }, update: { $set: set } } });
      if (ops.length >= WRITE_BATCH) await flush();
    }
    await flush();

    // Record today's portfolio totals for everyone whose holdings we touched.
    const userIds = await Investment.distinct('user', filter);
    await recordSnapshots(userIds, asOf);

    stats.durationMs = Date.now() - started;
    if (!scoped) {
      await JobState.updateOne(
        { key: JOB_KEY },
        { $set: { lastRunDate: asOf, lastRunAt: now, lastStats: stats } }
      );
    }
    console.log(
      `[prices] ${reason}: ${stats.updated} updated, ${stats.stale} stale, ${stats.manual} manual ` +
        `(${stats.instruments} instruments, ${stats.durationMs}ms)`
    );
    return { skipped: false, ...stats };
  } finally {
    if (!scoped) await releaseLock();
  }
}
