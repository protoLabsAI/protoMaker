/**
 * Electron Playwright test fixtures.
 *
 * Provides `electronApp` and `window` fixtures that launch the real Electron
 * binary with the compiled main process (dist-electron/main.js).
 *
 * Prerequisites:
 *   - Run `npm run build` first (builds dist/ and dist-electron/)
 *   - The backend server is spawned automatically by the Electron main process
 *
 * The fixture passes AUTOMAKER_MOCK_AGENT=true so tests don't hit the real API,
 * and AUTOMAKER_AUTO_LOGIN=true to skip the login prompt.
 */

import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';

const UI_DIR = path.resolve(__dirname, '../..');

export type ElectronFixtures = {
  electronApp: ElectronApplication;
  window: Page;
};

export const test = base.extend<ElectronFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const app = await _electron.launch({
      args: [path.join(UI_DIR, 'dist-electron/main.js')],
      cwd: UI_DIR,
      env: {
        ...process.env,
        // Use mock agent to avoid real API calls in tests
        AUTOMAKER_MOCK_AGENT: 'true',
        // Auto-login so we skip the auth prompt
        AUTOMAKER_AUTO_LOGIN: 'true',
        // Let Electron pick free ports
        PORT: '0',
        VITE_PORT: '0',
        // Prevent the app from using the user's real data
        NODE_ENV: 'test',
      },
      timeout: 60_000, // Electron + server startup can be slow
    });

    await use(app);
    await app.close();
  },

  window: async ({ electronApp }, use) => {
    // Wait for the first BrowserWindow to open
    const window = await electronApp.firstWindow();

    // Wait for the window to finish loading (Vite dev or static files)
    await window.waitForLoadState('domcontentloaded');

    await use(window);
  },
});

export { expect } from '@playwright/test';
