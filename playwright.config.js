'use strict';

const { defineConfig, devices } = require('@playwright/test');

const PORT = 8934;
const baseURL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // each test drives real localStorage/server state; keep it simple and deterministic
  // fullyParallel:false only serializes tests *within* one file — different
  // spec files still run across multiple workers by default. Every test's
  // isolatedServer fixture binds the same fixed port (see fixtures.js), so
  // concurrent workers would race for that port. Force one worker.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: '**/mobile/**' },
    // A focused subset of flows (not the whole suite duplicated) run under
    // real mobile device emulation — viewport, touch, UA — to catch the
    // class of bug device-width alone doesn't: hit-testing on touch
    // targets, drawer/backdrop interaction, etc. Pixel 5 (Chromium-based)
    // rather than an iPhone preset (WebKit-based) so this only needs the
    // one browser already installed for the desktop project — CI installs
    // just `chromium` (see .github/workflows/test.yml).
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testMatch: '**/mobile/**' },
  ],
  // No global webServer: server.py's disk-backed ServerSync is real
  // multi-device sync, so one shared instance across all tests meant one
  // test's state could get pulled into another's fresh browser context —
  // observed as flaky failures even after adding explicit resets, because
  // saveState()'s ServerSync.push() is fire-and-forget and could still be
  // in flight when a test ended. tests/e2e/fixtures.js's `isolatedServer`
  // fixture instead spawns (and fully tears down) a brand new instance —
  // fresh temp copy, empty data/ dir — for every single test.
});
