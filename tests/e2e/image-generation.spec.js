'use strict';

// Exercises the full ImageRouter submit-then-poll flow (app/image-router.js
// generateBFL) through the real popover UI, including the GET polling
// request that netlify/functions/proxy.js used to reject in production
// (covered directly against proxy.js in tests/unit/proxy.test.js; this test
// instead proves the browser-side wiring — popover → ImageRouter.generate →
// rendered <img> — works end-to-end).

const { test, expect, saveApiKey } = require('./fixtures');

// generateBFL() sends a custom `x-key` header cross-origin (page origin is
// http://127.0.0.1:PORT, api.bfl.ml is cross-origin), which makes the
// browser send a real CORS preflight (OPTIONS) before the POST/GET — a
// mocked response with no CORS headers fails that preflight and the
// fetch() rejects with a generic "Failed to fetch", not a helpful error.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-key, Authorization',
};

async function fulfillCors(route, opts) {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS_HEADERS });
    return;
  }
  await route.fulfill({ ...opts, headers: { ...CORS_HEADERS, ...(opts.headers || {}) } });
}

test('generating an image via the Imagine popover submits, polls, and renders the result', async ({ loggedInPage: page }) => {
  await saveApiKey(page, 'bfl', 'bfl-test-key-not-real');
  await page.goto('/app/');
  await expect(page.locator('#message-input')).toBeVisible();

  let pollCount = 0;
  await page.route('https://api.bfl.ml/v1/flux-pro-1.1', async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillCors(route, {});
    expect(route.request().method()).toBe('POST');
    await fulfillCors(route, { status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'job-e2e-1' }) });
  });
  await page.route('https://api.bfl.ml/v1/get_result**', async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillCors(route, {});
    expect(route.request().method()).toBe('GET');
    pollCount += 1;
    if (pollCount < 2) {
      await fulfillCors(route, { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'Pending' }) });
    } else {
      await fulfillCors(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'Ready', result: { sample: 'https://api.bfl.ml/generated.png', seed: 42 } }),
      });
    }
  });
  // urlToDataUrl() fetches the resulting image URL directly to convert it to a data: URL.
  const onePxPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
  await page.route('https://api.bfl.ml/generated.png', async (route) => {
    await fulfillCors(route, { status: 200, contentType: 'image/png', body: onePxPng });
  });

  await page.click('button:has-text("🎨 Imagine")');
  await page.locator('#imagine-prompt').waitFor({ state: 'visible' });
  await page.selectOption('#imagine-provider', 'bfl');
  await page.fill('#imagine-prompt', 'a small red circle');
  await page.click('.image-popover-generate');

  await expect(page.locator('.image-gen-img')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.image-gen-provider')).toContainText('bfl');
  expect(pollCount).toBeGreaterThanOrEqual(2);
});
