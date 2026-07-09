'use strict';

const base = require('@playwright/test');

const TEST_PASSWORD = 'TestPass123!';

/**
 * Drives the real first-login UI flow (default admin/admin123, then the
 * forced password-change screen every fresh install shows) and leaves the
 * page on the main chat shell. See app/auth.js renderLoginScreen() /
 * renderForcePasswordChange() for the DOM this depends on.
 */
async function loginAsAdmin(page) {
  await page.goto('/app/');
  await page.locator('#auth-username').waitFor({ state: 'visible' });
  await page.fill('#auth-username', 'admin');
  await page.fill('#auth-password', 'admin123');
  await page.click('#auth-submit-btn');

  await page.locator('#new-pw').waitFor({ state: 'visible', timeout: 10_000 });
  await page.fill('#new-pw', TEST_PASSWORD);
  await page.fill('#confirm-pw', TEST_PASSWORD);
  await page.locator('#change-pw-form button[type=submit]').click();

  await base.expect(page.locator('#message-input')).toBeVisible({ timeout: 15_000 });
}

/** Saves a fake API key for `providerId` via the real Admin UI (encrypts through the vault, same as a real user would). */
async function saveApiKey(page, providerId, fakeKey) {
  await page.goto('/app/admin.html');
  await page.click('#nav-item-connections');
  const input = page.locator(`#key-input-${providerId}`);
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(fakeKey);
  await page.click(`button[onclick="AdminApp.saveApiKey('${providerId}')"]`);
  await base.expect(page.locator(`#pill-${providerId}`)).toContainText('Configured', { timeout: 5_000 });
}

const test = base.test.extend({
  loggedInPage: async ({ page }, use) => {
    await loginAsAdmin(page);
    await use(page);
  },
});

module.exports = { test, expect: base.expect, loginAsAdmin, saveApiKey, TEST_PASSWORD };
