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
