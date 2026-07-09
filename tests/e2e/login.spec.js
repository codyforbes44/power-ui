'use strict';

const { test, expect } = require('./fixtures');

test('first login forces a password change, then lands on the chat shell', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.locator('#auth-username')).toBeVisible();

  await page.fill('#auth-username', 'admin');
  await page.fill('#auth-password', 'admin123');
  await page.click('#auth-submit-btn');

  await expect(page.locator('#new-pw')).toBeVisible({ timeout: 10_000 });
  await page.fill('#new-pw', 'TestPass123!');
  await page.fill('#confirm-pw', 'TestPass123!');
  await page.locator('#change-pw-form button[type=submit]').click();

  await expect(page.locator('#message-input')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#send-btn')).toBeVisible();
});

test('wrong password is rejected with an error, not a silent login', async ({ page }) => {
  await page.goto('/app/');
  await page.fill('#auth-username', 'admin');
  await page.fill('#auth-password', 'definitely-wrong');
  await page.click('#auth-submit-btn');

  await expect(page.locator('#auth-error-msg')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#message-input')).toHaveCount(0);
});

test('loggedInPage fixture reaches the chat shell (used by other specs)', async ({ loggedInPage }) => {
  await expect(loggedInPage.locator('#message-input')).toBeVisible();
});

// Regression test: login() creates a fully valid session *before* the caller
// acts on mustChangePassword — that flag was previously enforced only by the
// login form's own submit handler choosing to render the force-change
// screen. Navigating away instead (direct URL, new tab, a reload) skipped it
// entirely, since isLoggedIn() was already true. Covers both entry points:
// index.html's boot() and admin.html's requireAuth().
test('navigating away instead of completing the forced password change still blocks the app', async ({ page }) => {
  await page.goto('/app/');
  await page.fill('#auth-username', 'admin');
  await page.fill('#auth-password', 'admin123');
  await page.click('#auth-submit-btn');
  await expect(page.locator('#new-pw')).toBeVisible({ timeout: 10_000 });

  // Instead of completing the change-password form, reload straight into
  // the main app — the session is already valid at this point.
  await page.goto('/app/');
  await expect(page.locator('#new-pw')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#message-input')).toHaveCount(0);

  // Same for admin.html directly.
  await page.goto('/app/admin.html');
  await expect(page.locator('#new-pw')).toBeVisible({ timeout: 10_000 });
});
