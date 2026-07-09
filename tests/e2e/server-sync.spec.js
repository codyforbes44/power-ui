'use strict';

// Regression test for the ServerSync/ping schema mismatch: app.js was
// changed to require body.sync === true from /api/ping, but server.py's
// ping handler didn't send that field, so ServerSync.probe() always
// reported the local dev server as unavailable — silently breaking
// multi-device sync/disk persistence for every `python3 app/server.py`
// user. This hits the real isolated server.py instance the whole E2E
// suite runs against, not a mock.

const { test, expect } = require('./fixtures');

test('/api/ping reports sync:true against the real local server.py', async ({ request, baseURL }) => {
  const res = await request.get(`${baseURL}/api/ping`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.sync).toBe(true);
  expect(body.serverMode).toBe(true);
});

test('ServerSync.probe() (the actual app code, not a re-implementation) resolves available:true', async ({ loggedInPage: page }) => {
  const available = await page.evaluate(() => ServerSync.isAvailable());
  // loggedInPage's boot() already called probe() once during login/boot.
  expect(available).toBe(true);
});
