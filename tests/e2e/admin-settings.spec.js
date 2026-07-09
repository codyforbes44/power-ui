'use strict';

// Regression test for the localStorage key mismatch bug: admin.js's
// _getImageSetting/_patchImageSetting wrote image-gen defaults to
// 'cpu_state_v1', but app.js reads STATE.settings.imageGen from
// 'async_ai_v2' — so anything saved in Admin silently never took
// effect anywhere else in the app. This only shows up by actually saving
// in one page and reading back from another, which is what this test does.

const { test, expect } = require('./fixtures');

test('image generation defaults saved in Admin are picked up by the main app', async ({ loggedInPage: page }) => {
  await page.goto('/app/admin.html');
  await page.click('#nav-item-connections');

  await page.locator('#imgdef-provider').waitFor({ state: 'visible', timeout: 10_000 });
  await page.selectOption('#imgdef-provider', 'replicate');
  await page.selectOption('#imgdef-width', '768');
  await page.selectOption('#imgdef-height', '768');
  await page.fill('#imgdef-steps', '15');
  await page.click('button:has-text("Save Defaults")');

  // Read back from the *other* page — proves it went through the same
  // storage key the main app actually reads, not just round-tripped
  // within admin.js's own in-memory state.
  await page.goto('/app/');
  await expect(page.locator('#message-input')).toBeVisible();
  const imageGen = await page.evaluate(() => {
    const raw = localStorage.getItem('async_ai_v2');
    return JSON.parse(raw).settings.imageGen;
  });

  expect(imageGen.provider).toBe('replicate');
  expect(imageGen.width).toBe(768);
  expect(imageGen.height).toBe(768);
  expect(imageGen.steps).toBe(15);

  // Also confirm nothing was written to the old, wrong key.
  const staleKey = await page.evaluate(() => localStorage.getItem('cpu_state_v1'));
  expect(staleKey).toBeNull();
});

test('ComfyUI URL saved in Admin is picked up by the main app', async ({ loggedInPage: page }) => {
  await page.goto('/app/admin.html');
  await page.click('#nav-item-connections');

  await page.locator('#key-input-comfyui').waitFor({ state: 'visible', timeout: 10_000 });
  await page.fill('#key-input-comfyui', 'http://192.168.1.50:8188');
  await page.click('button[onclick="AdminApp.saveComfyUrl()"]');

  await page.goto('/app/');
  const comfyUrl = await page.evaluate(() => {
    const raw = localStorage.getItem('async_ai_v2');
    return JSON.parse(raw).settings.imageGen.comfyUrl;
  });
  expect(comfyUrl).toBe('http://192.168.1.50:8188');
});
