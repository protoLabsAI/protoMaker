/**
 * Electron App Launch Tests
 *
 * Verifies the Electron application launches, creates a window,
 * and the main process is accessible.
 */

import { test, expect } from './fixtures';

test.describe('Electron App Launch', () => {
  test('should launch and create a window', async ({ electronApp, window }) => {
    // Verify the app is running
    const isRunning = await electronApp.evaluate(async ({ app }) => {
      return app.isReady();
    });
    expect(isRunning).toBe(true);

    // Verify a window was created
    const title = await window.title();
    expect(title).toBeTruthy();
  });

  test('should expose electronAPI on window', async ({ window }) => {
    // The preload script exposes window.electronAPI
    const hasElectronAPI = await window.evaluate(() => {
      return typeof (window as any).electronAPI !== 'undefined';
    });
    expect(hasElectronAPI).toBe(true);
  });

  test('should report correct platform', async ({ window }) => {
    const platform = await window.evaluate(() => {
      return (window as any).electronAPI?.platform;
    });
    expect(platform).toBe(process.platform);
  });

  test('should report isElectron=true', async ({ window }) => {
    const isElectron = await window.evaluate(() => {
      return (window as any).electronAPI?.isElectron;
    });
    expect(isElectron).toBe(true);
  });

  test('should return app version', async ({ electronApp }) => {
    const version = await electronApp.evaluate(async ({ app }) => {
      return app.getVersion();
    });
    // Version should match package.json
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('should have correct app name', async ({ electronApp }) => {
    const name = await electronApp.evaluate(async ({ app }) => {
      return app.getName();
    });
    expect(name).toBe('Automaker');
  });
});
