'use strict';

const base = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');

const TEST_PASSWORD = 'TestPass123!';
const PORT = 8934;
const REPO_ROOT = path.join(__dirname, '..', '..');

async function waitForServer(baseURL, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/api/ping`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server.py did not respond on ${baseURL}/api/ping within ${timeoutMs}ms`);
}

/**
 * Drives the real first-login UI flow (default admin/admin123, then the
 * forced password-change screen every fresh install shows) and leaves the
 * page on the main chat shell. See app/auth.js renderLoginScreen() /
 * renderForcePasswordChange() for the DOM this depends on.
 */
async function loginAsAdmin(page) {
  await page.goto('/app/');
  await page.evaluate(() => localStorage.setItem('async_onboarded_v1', '1'));
  await page.locator('#auth-username').waitFor({ state: 'visible' });
  await page.fill('#auth-username', 'admin');
  await page.fill('#auth-password', 'admin123');
  await page.click('#auth-submit-btn');

  await page.locator('#new-pw').waitFor({ state: 'visible', timeout: 10_000 });
  await page.fill('#new-pw', TEST_PASSWORD);
  await page.fill('#confirm-pw', TEST_PASSWORD);
  await page.locator('#change-pw-form button[type=submit]').click();

  await base.expect(page.locator('#message-input')).toBeVisible({ timeout: 15_000 });

  await page.addStyleTag({ content: '#onboarding-overlay { display: none !important; pointer-events: none !important; }' });
}

/** Saves a fake API key for `providerId` via the real Admin UI (encrypts through the vault, same as a real user would). */
async function saveApiKey(page, providerId, fakeKey) {
  await page.goto('/app/admin.html');
  // Below 1024px the nav lives in an off-canvas drawer (see admin.css) —
  // .mobile-sidebar-btn only exists in the DOM at all under that
  // breakpoint, so isVisible() alone (no CSS assertion needed) tells us
  // whether it needs opening first.
  const hamburger = page.locator('button[onclick="AdminApp.toggleSidebar()"]');
  if (await hamburger.isVisible()) await hamburger.click();
  await page.click('#nav-item-connections');
  const input = page.locator(`#key-input-${providerId}`);
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(fakeKey);
  await page.click(`button[onclick="AdminApp.saveApiKey('${providerId}')"]`);
  await base.expect(page.locator(`#pill-${providerId}`)).toContainText('Configured', { timeout: 5_000 });
}

const test = base.test.extend({
  // Test-scoped (not worker-scoped) auto-fixture: spawns a brand new
  // app/server.py instance — fresh temp copy of app/+public/, empty data/
  // dir — for every single test, and fully tears it down afterward.
  //
  // Earlier this suite shared ONE server for the whole run and reset its
  // state.json between tests, but server.py's ServerSync is real
  // multi-device sync and saveState()'s ServerSync.push() is fire-and-
  // forget: a test's trailing push could still be in flight when the next
  // test's reset ran, and that straggler would then get pulled into the
  // next test's fresh browser context by one of its own page navigations.
  // That raced intermittently no matter how the reset was timed. A fresh
  // server per test has no prior state to leak in the first place.
  // Playwright statically parses this destructuring pattern to know the
  // fixture has no dependencies; a renamed plain parameter breaks its
  // introspection, so the empty pattern below is required, not a typo.
  // eslint-disable-next-line no-empty-pattern
  isolatedServer: [async ({}, use) => {
    const baseURL = `http://127.0.0.1:${PORT}`;
    const child = spawn('bash', ['tests/e2e/isolated-server.sh', String(PORT)], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    const exited = new Promise((resolve) => child.once('exit', resolve));

    try {
      await waitForServer(baseURL);
    } catch (err) {
      child.kill('SIGTERM');
      await exited;
      throw err;
    }

    await use(baseURL);

    child.kill('SIGTERM');
    await exited; // isolated-server.sh's own trap kills python + removes the temp dir before exiting
  }, { auto: true, scope: 'test' }],

  loggedInPage: async ({ page, isolatedServer }, use) => {
    await loginAsAdmin(page);
    await use(page);
  },
});

module.exports = { test, expect: base.expect, loginAsAdmin, saveApiKey, TEST_PASSWORD };
