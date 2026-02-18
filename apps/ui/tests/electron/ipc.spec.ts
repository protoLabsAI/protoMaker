/**
 * Electron IPC Channel Tests
 *
 * Verifies that all IPC channels exposed via the preload script
 * (window.electronAPI) are functional. Tests the bridge between
 * the renderer process and the main process.
 *
 * Prerequisites:
 *   - Run `npm run build` first (builds dist/ and dist-electron/)
 *   - The backend server is spawned automatically by the Electron main process
 */

import { test, expect } from './fixtures';

test.describe('IPC: electronAPI shape', () => {
  test('should expose all expected methods on window.electronAPI', async ({ window }) => {
    const apiShape = await window.evaluate(() => {
      const api = (window as any).electronAPI;
      if (!api) return null;
      return {
        // Platform info (static properties)
        hasPlatform: typeof api.platform === 'string',
        hasIsElectron: typeof api.isElectron === 'boolean',
        // Functions
        hasPing: typeof api.ping === 'function',
        hasGetServerUrl: typeof api.getServerUrl === 'function',
        hasGetApiKey: typeof api.getApiKey === 'function',
        hasIsExternalServerMode: typeof api.isExternalServerMode === 'function',
        hasOpenDirectory: typeof api.openDirectory === 'function',
        hasOpenFile: typeof api.openFile === 'function',
        hasSaveFile: typeof api.saveFile === 'function',
        hasOpenExternalLink: typeof api.openExternalLink === 'function',
        hasOpenPath: typeof api.openPath === 'function',
        hasOpenInEditor: typeof api.openInEditor === 'function',
        hasGetPath: typeof api.getPath === 'function',
        hasGetVersion: typeof api.getVersion === 'function',
        hasIsPackaged: typeof api.isPackaged === 'function',
        hasUpdateMinWidth: typeof api.updateMinWidth === 'function',
        hasQuit: typeof api.quit === 'function',
      };
    });

    expect(apiShape).not.toBeNull();
    // Static properties
    expect(apiShape!.hasPlatform).toBe(true);
    expect(apiShape!.hasIsElectron).toBe(true);
    // All IPC methods
    expect(apiShape!.hasPing).toBe(true);
    expect(apiShape!.hasGetServerUrl).toBe(true);
    expect(apiShape!.hasGetApiKey).toBe(true);
    expect(apiShape!.hasIsExternalServerMode).toBe(true);
    expect(apiShape!.hasOpenDirectory).toBe(true);
    expect(apiShape!.hasOpenFile).toBe(true);
    expect(apiShape!.hasSaveFile).toBe(true);
    expect(apiShape!.hasOpenExternalLink).toBe(true);
    expect(apiShape!.hasOpenPath).toBe(true);
    expect(apiShape!.hasOpenInEditor).toBe(true);
    expect(apiShape!.hasGetPath).toBe(true);
    expect(apiShape!.hasGetVersion).toBe(true);
    expect(apiShape!.hasIsPackaged).toBe(true);
    expect(apiShape!.hasUpdateMinWidth).toBe(true);
    expect(apiShape!.hasQuit).toBe(true);
  });
});

test.describe('IPC: ping', () => {
  test('should return pong', async ({ window }) => {
    const result = await window.evaluate(async () => {
      return (window as any).electronAPI.ping();
    });
    expect(result).toBe('pong');
  });
});

test.describe('IPC: app info', () => {
  test('should return a valid version string', async ({ window }) => {
    const version = await window.evaluate(async () => {
      return (window as any).electronAPI.getVersion();
    });
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('should return isPackaged as false in dev/test', async ({ window }) => {
    // When running from source (not a packaged build), isPackaged is false
    const isPackaged = await window.evaluate(async () => {
      return (window as any).electronAPI.isPackaged();
    });
    expect(isPackaged).toBe(false);
  });

  test('should return a valid path for userData', async ({ window }) => {
    const userDataPath = await window.evaluate(async () => {
      return (window as any).electronAPI.getPath('userData');
    });
    expect(typeof userDataPath).toBe('string');
    expect(userDataPath.length).toBeGreaterThan(0);
  });
});

test.describe('IPC: server connection', () => {
  test('should return localhost URL with a port', async ({ window }) => {
    const serverUrl = await window.evaluate(async () => {
      return (window as any).electronAPI.getServerUrl();
    });
    expect(serverUrl).toMatch(/^http:\/\/localhost:\d+$/);
  });

  test('should return an API key (or null in external mode)', async ({ window }) => {
    const apiKey = await window.evaluate(async () => {
      return (window as any).electronAPI.getApiKey();
    });
    // In test mode, API key may be a string or null depending on config
    expect(apiKey === null || typeof apiKey === 'string').toBe(true);
  });

  test('should report external server mode status', async ({ window }) => {
    const isExternal = await window.evaluate(async () => {
      return (window as any).electronAPI.isExternalServerMode();
    });
    expect(typeof isExternal).toBe('boolean');
  });
});

test.describe('IPC: platform info', () => {
  test('should expose correct platform', async ({ window }) => {
    const platform = await window.evaluate(() => {
      return (window as any).electronAPI.platform;
    });
    expect(platform).toBe(process.platform);
  });

  test('should expose isElectron as true', async ({ window }) => {
    const isElectron = await window.evaluate(() => {
      return (window as any).electronAPI.isElectron;
    });
    expect(isElectron).toBe(true);
  });
});

test.describe('IPC: window management', () => {
  test('should handle updateMinWidth without error', async ({ window }) => {
    // updateMinWidth should not throw for either sidebar state
    const result = await window.evaluate(async () => {
      try {
        await (window as any).electronAPI.updateMinWidth(true);
        await (window as any).electronAPI.updateMinWidth(false);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: String(e) };
      }
    });
    expect(result.success).toBe(true);
  });
});
