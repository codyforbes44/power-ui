'use strict';

// Runs under real mobile device emulation (viewport + touch + UA — see the
// `mobile` project in playwright.config.js, devices['iPhone 13']), not just
// a resized desktop browser. A focused subset of the full suite: the flows
// that are actually different on mobile (off-canvas drawers, the header's
// reachability of a now off-screen sidebar toggle), not a re-run of
// everything the desktop project already covers.

const { test, expect, saveApiKey } = require('../fixtures');

test('login renders correctly and reaches the chat shell on a real mobile viewport', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.locator('#auth-username')).toBeVisible();
  await page.fill('#auth-username', 'admin');
  await page.fill('#auth-password', 'admin123');
  await page.tap('#auth-submit-btn');

  await expect(page.locator('#new-pw')).toBeVisible({ timeout: 10_000 });
  await page.fill('#new-pw', 'TestPass123!');
  await page.fill('#confirm-pw', 'TestPass123!');
  await page.tap('#change-pw-form button[type=submit]');

  await expect(page.locator('#message-input')).toBeVisible({ timeout: 15_000 });
  // The sidebar must start off-canvas, not squeezed into the 3-column
  // desktop layout — this is the core bug this whole pass fixed.
  const sidebarBox = await page.locator('#sidebar').boundingBox();
  expect(sidebarBox.x).toBeLessThan(0);
});

test('sidebar drawer opens via the header button and closes via the backdrop', async ({ loggedInPage: page }) => {
  await expect(page.locator('#mobile-sidebar-btn')).toBeVisible();
  await page.tap('#mobile-sidebar-btn');
  await expect(page.locator('#drawer-backdrop')).toHaveClass(/visible/);
  await page.waitForTimeout(400); // the slide-in is a CSS transition, not instant

  const sidebarBox = await page.locator('#sidebar').boundingBox();
  expect(sidebarBox.x).toBe(0);

  // Tap the backdrop outside the drawer's own width.
  await page.tap('#drawer-backdrop', { position: { x: sidebarBox.width + 40, y: 300 } });
  await expect(page.locator('#drawer-backdrop')).not.toHaveClass(/visible/);
});

test('sending a message works on a real mobile viewport', async ({ loggedInPage: page }) => {
  await saveApiKey(page, 'anthropic', 'sk-ant-test-key-not-real');
  await page.goto('/app/');
  await expect(page.locator('#message-input')).toBeVisible();

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const sse = [
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 5 } } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello from mobile.' } })}`,
      `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 4 } })}`,
      `data: ${JSON.stringify({ type: 'message_stop' })}`,
    ];
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse.join('\n\n') + '\n\n' });
  });

  await page.fill('#message-input', 'Hi there');
  await page.tap('#send-btn');
  await expect(page.locator('.message-bubble').last()).toContainText('Hello from mobile.', { timeout: 15_000 });
});

test('admin nav drawer opens via the header button and auto-closes on nav selection', async ({ loggedInPage: page }) => {
  await page.goto('/app/admin.html');
  await page.locator('.admin-topbar-title').waitFor({ state: 'visible' });

  const hamburger = page.locator('button[onclick="AdminApp.toggleSidebar()"]');
  await expect(hamburger).toBeVisible();
  await hamburger.tap();
  await expect(page.locator('#admin-drawer-backdrop')).toHaveClass(/visible/);

  await page.tap('#nav-item-users');
  await expect(page.locator('#admin-drawer-backdrop')).not.toHaveClass(/visible/);
  await expect(page.locator('.admin-topbar-title')).toContainText('User Management');
});

test('agent-chat drawer opens via nav-toggle and closes via close button or view switch on mobile', async ({ loggedInPage: page }) => {
  await page.goto('/app/agent-chat.html');
  await expect(page.locator('#nav-toggle')).toBeVisible();

  // 1. Open drawer and close it via the Close button
  await page.tap('#nav-toggle');
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await page.tap('.sb-close');
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);

  // 2. Switch view to Image Gen (while drawer is closed)
  await page.tap('.action-btn:has-text("Generate Images")');
  await expect(page.locator('#img-gen-main-inner')).toBeVisible();

  // 3. Open the drawer (now showing image gen settings)
  await page.tap('#nav-toggle');
  await expect(page.locator('#sidebar')).toHaveClass(/open/);

  // 4. Tap the back arrow in the drawer to return to chat and auto-close the drawer
  await page.tap('.sb-back');
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  await expect(page.locator('#chat-main-inner')).toBeVisible();
});
