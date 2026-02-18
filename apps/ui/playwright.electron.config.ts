import { defineConfig } from '@playwright/test';

/**
 * Playwright config for Electron-specific tests.
 *
 * Unlike the web config (playwright.config.ts), this does NOT launch a browser.
 * Tests use the custom `electronApp` fixture from ./tests/electron/fixtures.ts
 * which launches the real Electron binary via Playwright's _electron API.
 *
 * Usage:
 *   npx playwright test --config playwright.electron.config.ts
 */
export default defineConfig({
  testDir: './tests/electron',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Electron tests must run sequentially (single app instance)
  reporter: 'html',
  timeout: 60000, // Electron startup + server spawn takes longer
  expect: {
    timeout: 10_000,
  },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // No webServer — Electron spawns its own backend server
});
