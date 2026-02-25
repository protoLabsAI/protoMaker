import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.electron.config';

/**
 * Playwright config for smoke tests on installed Electron builds.
 *
 * This config extends the base Electron config but:
 * - Points to ./tests/electron/smoke/ directory
 * - Uses a longer timeout (90s) for installation + launch
 * - Runs tests sequentially (workers: 1) due to installation conflicts
 * - Expects ELECTRON_EXEC_PATH env var pointing to the installed executable
 *
 * Usage:
 *   ELECTRON_EXEC_PATH=/path/to/installed/app npm run test:smoke
 *
 * CI Usage (example):
 *   ELECTRON_EXEC_PATH=/tmp/test-app/protoLabs.studio.app/Contents/MacOS/protoLabs.studio \
 *     npm run test:smoke --workspace=apps/ui
 */
export default defineConfig({
  ...baseConfig,
  testDir: './tests/electron/smoke',
  timeout: 90000, // 90s for install + launch + server startup
  workers: 1, // Sequential execution (installation tests can't run in parallel)
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
