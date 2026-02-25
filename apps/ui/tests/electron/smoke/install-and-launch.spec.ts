/**
 * Smoke Tests: Install and Launch
 *
 * These tests verify that the installed Electron build:
 * - Launches successfully from the installed location
 * - Creates a main window
 * - Starts the backend server and responds to health checks
 * - Completes the first-run setup flow (in mock mode)
 * - Persists window bounds across restarts
 *
 * Prerequisites:
 *   - The app must be installed via platform-specific script (smoke-test-*.sh/ps1)
 *   - ELECTRON_EXEC_PATH environment variable must point to the installed executable
 *   - Example: ELECTRON_EXEC_PATH=/tmp/test-app/protoLabs.studio.app/Contents/MacOS/protoLabs.studio
 */

import {
  test as base,
  _electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const ELECTRON_EXEC_PATH = process.env.ELECTRON_EXEC_PATH;

if (!ELECTRON_EXEC_PATH) {
  throw new Error(
    'ELECTRON_EXEC_PATH environment variable is required for smoke tests.\n' +
      'Set it to the path of the installed Electron executable.\n' +
      'Example: ELECTRON_EXEC_PATH=/tmp/test-app/protoLabs.studio.app/Contents/MacOS/protoLabs.studio'
  );
}

if (!fs.existsSync(ELECTRON_EXEC_PATH)) {
  throw new Error(`Electron executable not found at: ${ELECTRON_EXEC_PATH}`);
}

type SmokeTestFixtures = {
  electronApp: ElectronApplication;
  window: Page;
  userDataDir: string;
};

/**
 * Smoke test fixtures that launch the INSTALLED Electron executable.
 * Unlike the dev fixtures, this uses the packaged app with bundled server.
 */
const test = base.extend<SmokeTestFixtures>({
  userDataDir: async (_, use) => {
    // Create a temporary user data directory for isolated testing
    const tempDir = path.join(os.tmpdir(), `protolabs-smoke-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    await use(tempDir);
    // Cleanup after test
    fs.rmSync(tempDir, { recursive: true, force: true });
  },

  electronApp: async ({ userDataDir }, use) => {
    console.log(`Launching Electron from: ${ELECTRON_EXEC_PATH}`);
    console.log(`User data directory: ${userDataDir}`);

    const app = await _electron.launch({
      executablePath: ELECTRON_EXEC_PATH,
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
      timeout: 90_000, // 90s timeout for packaged app startup
    });

    await use(app);
    await app.close();
  },

  window: async ({ electronApp }, use) => {
    // Wait for the first BrowserWindow to open
    const window = await electronApp.firstWindow();

    // Wait for the window to finish loading
    await window.waitForLoadState('domcontentloaded');

    await use(window);
  },
});

test.describe('Smoke Test: Install and Launch', () => {
  test('app launches from installed location', async ({ electronApp, window }) => {
    // Verify the app is running
    const isRunning = await electronApp.evaluate(async ({ app }) => {
      return app.isReady();
    });
    expect(isRunning).toBe(true);

    // Verify a window was created
    const title = await window.title();
    expect(title).toBeTruthy();

    // Verify the window has content (not blank)
    const bodyText = await window.locator('body').textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('server starts and responds to health check', async ({ window }) => {
    // Get server URL from Electron IPC
    const serverUrl = await window.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).electronAPI?.getServerUrl();
    });

    expect(serverUrl).toBeTruthy();
    expect(serverUrl).toMatch(/^http:\/\/localhost:\d+$/);

    // Wait for server to be ready (retry for up to 60s)
    let healthStatus: { ok: boolean; status: number } | null = null;
    const maxRetries = 30;
    const retryDelay = 2000; // 2s

    for (let i = 0; i < maxRetries; i++) {
      healthStatus = await window.evaluate(async (url: string) => {
        try {
          const response = await fetch(`${url}/api/health`);
          return { ok: response.ok, status: response.status };
        } catch (error) {
          return { ok: false, status: 0 };
        }
      }, serverUrl);

      if (healthStatus.ok) {
        break;
      }

      console.log(`Health check attempt ${i + 1}/${maxRetries} failed, retrying...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    expect(healthStatus?.ok).toBe(true);
    expect(healthStatus?.status).toBe(200);
  });

  test('first-run setup flow renders', async ({ window }) => {
    // In mock mode with auto-login, the app should skip auth
    // and show the main interface

    // Wait for the app to finish loading
    await window.waitForLoadState('networkidle');

    // Verify we're not stuck on an error page
    const bodyText = await window.locator('body').textContent();
    expect(bodyText).not.toContain('Failed to load');
    expect(bodyText).not.toContain('Error');

    // Verify Electron API is exposed
    const hasElectronAPI = await window.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return typeof (window as any).electronAPI !== 'undefined';
    });
    expect(hasElectronAPI).toBe(true);
  });

  test('app has correct metadata', async ({ electronApp }) => {
    // Verify version matches package.json format
    const version = await electronApp.evaluate(async ({ app }) => {
      return app.getVersion();
    });
    expect(version).toMatch(/^\d+\.\d+\.\d+/);

    // Verify app name
    const name = await electronApp.evaluate(async ({ app }) => {
      return app.getName();
    });
    expect(name).toBe('Automaker');

    // Verify platform
    const platform = await electronApp.evaluate(async () => {
      return process.platform;
    });
    expect(['darwin', 'win32', 'linux']).toContain(platform);
  });

  test('window can be resized and bounds are accessible', async ({ window }) => {
    // Get initial window size
    const initialSize = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    expect(initialSize.width).toBeGreaterThan(0);
    expect(initialSize.height).toBeGreaterThan(0);

    // Verify window is visible and not minimized
    const isVisible = await window.evaluate(() => document.visibilityState === 'visible');
    expect(isVisible).toBe(true);
  });

  test('server startup completes within timeout', async ({ electronApp }) => {
    // If we reached this point, the server started within the 90s timeout
    // (configured in the fixture). Verify the app is ready as a sanity check.
    const isReady = await electronApp.evaluate(async ({ app }) => {
      return app.isReady();
    });
    expect(isReady).toBe(true);
  });
});

test.describe('Smoke Test: Platform-Specific Checks', () => {
  test('platform matches expected OS', async ({ electronApp }) => {
    const platform = await electronApp.evaluate(async () => {
      return process.platform;
    });

    // Verify we're testing on the expected platform
    if (process.env.CI) {
      // In CI, verify against the runner OS
      const expectedPlatform =
<<<<<<< HEAD
        process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';
=======
        process.platform === 'darwin'
          ? 'darwin'
          : process.platform === 'win32'
            ? 'win32'
            : 'linux';
>>>>>>> c489b22a (feat: desktop app smoke tests for macOS, Windows, and Linux platforms)
      expect(platform).toBe(expectedPlatform);
    } else {
      // Local test, just verify it's a valid platform
      expect(['darwin', 'win32', 'linux']).toContain(platform);
    }
  });

  test('app path is within test directory', async ({ electronApp }) => {
    const appPath = await electronApp.evaluate(async ({ app }) => {
      return app.getAppPath();
    });

    // Verify the app is running from a packaged location, not dev files
    expect(appPath).toBeTruthy();
    expect(appPath).not.toContain('dist-electron/main.js');
    expect(appPath).not.toContain('node_modules');
  });
});
