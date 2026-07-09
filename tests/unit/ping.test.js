'use strict';

// netlify/functions/ping.js is the production (Netlify static-deploy) ping
// endpoint — it must report sync:false, since there is no server-side sync
// on a static deploy. app/server.py has its own /api/ping (tested in
// tests/e2e/server-sync.spec.js) which must report sync:true instead —
// ServerSync.probe() in app/app.js branches on this exact field.

const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../../netlify/functions/ping.js');

test('reports mode:static and sync:false', async () => {
  const res = await handler();
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.mode, 'static');
  assert.equal(body.sync, false);
});
