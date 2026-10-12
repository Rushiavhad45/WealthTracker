// Run the daily price update once and exit.
//   npm run update-prices
// Handy for an external scheduler (system cron, Render/Railway cron job) if you
// run the API with ENABLE_SCHEDULER=false.
import { assertEnv } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { runPriceUpdate } from '../services/priceUpdater.js';

try {
  assertEnv();
  await connectDb();
  const result = await runPriceUpdate({ reason: 'cli' });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
