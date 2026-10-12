import { assertEnv } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';
import { startScheduler } from './jobs/scheduler.js';

async function main() {
  assertEnv();
  await connectDb();
  console.log('[db] connected to MongoDB');

  const port = Number(process.env.PORT) || 5000;
  const server = createApp().listen(port, () => console.log(`[api] listening on http://localhost:${port}`));

  const scheduler = process.env.ENABLE_SCHEDULER === 'false' ? null : startScheduler();
  if (!scheduler) console.log('[prices] built-in scheduler disabled (ENABLE_SCHEDULER=false)');

  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received, shutting down...`);
    scheduler?.stop();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
