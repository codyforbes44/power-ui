'use strict';

const { defineConfig, devices } = require('@playwright/test');

const PORT = 8934;
const baseURL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // each test drives real localStorage/server state; keep it simple and deterministic
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `bash tests/e2e/isolated-server.sh ${PORT}`,
    url: `${baseURL}/api/ping`,
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
