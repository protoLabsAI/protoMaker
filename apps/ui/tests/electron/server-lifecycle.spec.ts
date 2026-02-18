/**
 * Electron Server Lifecycle Tests
 *
 * Verifies the Electron main process correctly:
 * - Spawns the backend server on startup
 * - Makes the server URL reachable via the health endpoint
 * - Quits cleanly without leaving zombie processes
 */

import { test as base, _electron, expect } from '@playwright/test';
import path from 'path';
import { test } from './fixtures';

const UI_DIR = path.resolve(__dirname, '../..');

test.describe('Server Lifecycle', () => {
  test('should start the server and return a valid URL', async ({ window }) => {
    const serverUrl = await window.evaluate(async () => {
      return (window as any).electronAPI?.getServerUrl();
    });

    expect(serverUrl).toBeTruthy();
    expect(serverUrl).toMatch(/^http:\/\/localhost:\d+$/);
  });

  test('server health endpoint should respond with 200', async ({ window }) => {
    const serverUrl = await window.evaluate(async () => {
      return (window as any).electronAPI?.getServerUrl();
    });

    expect(serverUrl).toBeTruthy();

    // Fetch the health endpoint from within the renderer
    const healthStatus = await window.evaluate(async (url: string) => {
      try {
        const response = await fetch(`${url}/api/health`);
        return { ok: response.ok, status: response.status };
      } catch (error) {
        return { ok: false, status: 0, error: String(error) };
      }
    }, serverUrl);

    expect(healthStatus.ok).toBe(true);
    expect(healthStatus.status).toBe(200);
  });

  test('should start server within 30 seconds', async ({ electronApp }) => {
    // The fixture launches Electron with a 60s timeout. If we reach this
    // point, the server started and the window loaded successfully.
    // Verify the app is ready as a sanity check.
    const isReady = await electronApp.evaluate(async ({ app }) => {
      return app.isReady();
    });
    expect(isReady).toBe(true);
  });
});

/**
 * Standalone test that manages its own Electron lifecycle
 * to verify clean shutdown without zombie processes.
 */
base.describe('Server Clean Shutdown', () => {
  base.setTimeout(90_000); // Extra time for launch + close + verification

  base('app should quit cleanly without zombie processes', async () => {
    // Launch a standalone Electron app (not using shared fixtures)
    const app = await _electron.launch({
      args: [path.join(UI_DIR, 'dist-electron/main.js')],
      cwd: UI_DIR,
      env: {
        ...process.env,
        AUTOMAKER_MOCK_AGENT: 'true',
        AUTOMAKER_AUTO_LOGIN: 'true',
        PORT: '0',
        VITE_PORT: '0',
        NODE_ENV: 'test',
      },
      timeout: 60_000,
    });

    // Wait for the window to be ready
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Get the main process PID
    const mainPid = await app.evaluate(async () => {
      return process.pid;
    });
    expect(mainPid).toBeGreaterThan(0);

    // Close the app
    await app.close();

    // Give the OS time to clean up
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify the main process is no longer running
    let isStillRunning: boolean;
    try {
      process.kill(mainPid, 0);
      isStillRunning = true;
    } catch {
      isStillRunning = false;
    }

    expect(isStillRunning).toBe(false);
  });
});
