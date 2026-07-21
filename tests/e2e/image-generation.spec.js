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
  const redPxPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWL6z8DwHwAAAP//A3ONEwAAAAZJREFUAwAFCgIByRpMngAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.route('https://api.bfl.ml/generated.png', async (route) => {
    await fulfillCors(route, { status: 200, contentType: 'image/png', body: redPxPng });
  });

  await page.click('button:has-text("🎨 Imagine")');
  await page.locator('#imagine-prompt').waitFor({ state: 'visible' });
  await page.selectOption('#imagine-provider', 'bfl');
  await page.fill('#imagine-prompt', 'a small red circle');
  await page.click('.image-popover-generate');

  await expect(page.locator('.image-gen-img')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.image-gen-provider')).toContainText('bfl');
  expect(pollCount).toBeGreaterThanOrEqual(2);

  // Verify that the rendered image is NOT completely black
  const isBlack = await page.evaluate(async () => {
    const img = document.querySelector('.image-gen-img');
    if (!img) return true;
    if (!img.complete) {
      await new Promise(r => img.onload = r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 1;
    canvas.height = img.naturalHeight || img.height || 1;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    // Check if any pixel is non-black (non-zero R, G, or B, and has alpha > 0)
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] !== 0 || data[i+1] !== 0 || data[i+2] !== 0) && data[i+3] > 0) {
        return false; // Found a non-black pixel!
      }
    }
    return true; // All pixels are black or fully transparent
  });
  expect(isBlack).toBe(false);
});

test('generating a video via the Imagine popover with fal provider renders video tag', async ({ loggedInPage: page }) => {
  await saveApiKey(page, 'fal', 'fal-test-key-not-real');
  await page.goto('/app/');
  await expect(page.locator('#message-input')).toBeVisible();

  await page.route('https://fal.run/storage/upload/initiate', async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillCors(route, {});
    expect(route.request().method()).toBe('POST');
    await fulfillCors(route, {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        upload_url: 'https://storage.googleapis.com/test-bucket/upload-123',
        file_url: 'https://fal.run/generated-uploaded.jpg'
      }),
    });
  });

  await page.route('https://storage.googleapis.com/test-bucket/upload-123', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    expect(route.request().method()).toBe('PUT');
    await route.fulfill({ status: 200, headers: CORS_HEADERS });
  });

  await page.route('https://fal.run/fal-ai/kling-video/v3/turbo/pro/image-to-video', async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillCors(route, {});
    expect(route.request().method()).toBe('POST');
    // Ensure the payload contains the uploaded public CDN image_url, not the raw base64 string
    const reqBody = JSON.parse(route.request().postData());
    expect(reqBody.image_url).toBe('https://fal.run/generated-uploaded.jpg');
    
    await fulfillCors(route, {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ video: { url: 'https://fal.run/generated.mp4' }, seed: 123 }),
    });
  });

  const onePxMp4 = Buffer.from(
    'AAAAIGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAAAh0cmVmAAAAAGZyZWUAAAAIbWRhdAAAAAhzaWR4AAAAAG1ldGE=',
    'base64'
  );
  await page.route('https://fal.run/generated.mp4', async (route) => {
    await fulfillCors(route, { status: 200, contentType: 'video/mp4', body: onePxMp4 });
  });

  await page.click('button:has-text("🎨 Imagine")');
  await page.locator('#imagine-prompt').waitFor({ state: 'visible' });
  await page.selectOption('#imagine-provider', 'fal');
  
  // Choose the Kling v3 Turbo Pro Video model
  await page.selectOption('#imagine-model', 'fal-ai/kling-video/v3/turbo/pro/image-to-video');
  
  // Verify that the reference image input becomes visible
  await expect(page.locator('#imagine-ref-row')).toBeVisible();
  
  // Fill in inputs with a base64 Data URI
  await page.fill('#imagine-image-url', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  await page.fill('#imagine-prompt', 'make the character wave');
  await page.click('.image-popover-generate');

  // Verify that the video tag is rendered in the chat
  const videoLocator = page.locator('video.image-gen-img');
  await expect(videoLocator).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.image-gen-provider')).toContainText('fal');
});

test('generating an image via agent-chat Imagine popover renders non-black image', async ({ loggedInPage: page }) => {
  await saveApiKey(page, 'anthropic', 'sk-ant-test-key-not-real');
  await saveApiKey(page, 'bfl', 'bfl-test-key-not-real');
  await page.goto('/app/agent-chat.html');
  await page.waitForURL('**/agent-chat.html');

  let messageCallCount = 0;
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    messageCallCount += 1;
    let sse;
    if (messageCallCount === 1) {
      // First call: Anthropic responds with a tool call to 'generate_image'
      sse = [
        `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 20 } } })}`,
        `data: ${JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool_agent_image', name: 'generate_image' } })}`,
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"prompt":"a beautiful sunset","provider":"bfl","size":"1024x1024"}' } })}`,
        `data: ${JSON.stringify({ type: 'content_block_stop' })}`,
        `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 15 } })}`,
        `data: ${JSON.stringify({ type: 'message_stop' })}`,
      ];
    } else {
      // Second call: Anthropic responds with the final answer text
      sse = [
        `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 40 } } })}`,
        `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'I have generated the image for you.' } })}`,
        `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 10 } })}`,
        `data: ${JSON.stringify({ type: 'message_stop' })}`,
      ];
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse.join('\n\n') + '\n\n',
    });
  });

  let pollCount = 0;
  await page.route('https://api.bfl.ml/v1/flux-pro-1.1', async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillCors(route, {});
    expect(route.request().method()).toBe('POST');
    await fulfillCors(route, { status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'job-e2e-agent-2' }) });
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

  const redPxPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWL6z8DwHwAAAP//A3ONEwAAAAZJREFUAwAFCgIByRpMngAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.route('https://api.bfl.ml/generated.png', async (route) => {
    await fulfillCors(route, { status: 200, contentType: 'image/png', body: redPxPng });
  });

  // Trigger the imagine popover on agent-chat
  await page.click('#imagine-btn');
  await page.locator('#imagine-prompt').waitFor({ state: 'visible' });
  await page.fill('#imagine-prompt', 'a beautiful sunset');
  await page.selectOption('#imagine-provider', 'bfl');
  await page.click('.image-popover-generate');

  // Expand the collapsed tool result block to make the image visible
  await page.locator('.trh').click();

  // Verify the image container is loaded and visible
  const imgLocator = page.locator('div.trb.gal-source img');
  await expect(imgLocator).toBeVisible({ timeout: 20_000 });

  // Verify that the rendered image is NOT completely black
  const isBlack = await page.evaluate(async () => {
    const img = document.querySelector('div.trb.gal-source img');
    if (!img) return true;
    if (!img.complete) {
      await new Promise(r => img.onload = r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 1;
    canvas.height = img.naturalHeight || img.height || 1;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    // Check if any pixel is non-black (non-zero R, G, or B, and has alpha > 0)
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] !== 0 || data[i+1] !== 0 || data[i+2] !== 0) && data[i+3] > 0) {
        return false; // Found a non-black pixel!
      }
    }
    return true; // All pixels are black or fully transparent
  });
  expect(isBlack).toBe(false);
});
