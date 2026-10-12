import './helpers.js'; // sets env first
process.env.AUTH_RATE_LIMIT = '3';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

let server, base, disconnectDb;

before(async () => {
  const { connectDb, disconnectDb: d } = await import('../config/db.js');
  const { createApp } = await import('../app.js');
  disconnectDb = d;
  await connectDb('mongodb://127.0.0.1:27017/invest-tracker-test-rate');
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});

test('login attempts are rate limited per IP (brute-force protection)', async () => {
  const attempt = () =>
    fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@example.com', password: 'wrong-password' }),
    });
  const statuses = [];
  for (let i = 0; i < 5; i += 1) statuses.push((await attempt()).status);
  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
  assert.match((await (await attempt()).json()).message, /Too many attempts/);
});
