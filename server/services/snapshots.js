import mongoose from 'mongoose';
import { Investment } from '../models/Investment.js';
import { PortfolioSnapshot } from '../models/PortfolioSnapshot.js';
import { todayIST } from '../utils/dates.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Upsert today's (IST) portfolio total for each given user. Called after every
 * holding change and after the daily price update, so the growth chart always
 * has an up-to-date point for today.
 *
 * Totals are summed in JS over a cursor rather than with a $group stage: it is
 * portable across MongoDB-compatible servers (a field named `current` collides
 * with the `$current` system-variable syntax on some of them) and the data per
 * user is small.
 */
export async function recordSnapshots(userIds, date = todayIST()) {
  const ids = [...new Set(userIds.map(String))];
  if (!ids.length) return 0;

  const totals = new Map(ids.map((id) => [id, { invested: 0, current: 0 }]));
  const cursor = Investment.find(
    { user: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } },
    'user invested current'
  )
    .lean()
    .cursor();
  for await (const inv of cursor) {
    const t = totals.get(String(inv.user));
    t.invested += inv.invested || 0;
    t.current += inv.current || 0;
  }

  const ops = ids.map((id) => ({
    updateOne: {
      filter: { user: id, date },
      update: { $set: { invested: round2(totals.get(id).invested), current: round2(totals.get(id).current) } },
      upsert: true,
    },
  }));
  await PortfolioSnapshot.bulkWrite(ops, { ordered: false });
  return ops.length;
}
