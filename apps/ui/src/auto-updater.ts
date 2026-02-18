/**
 * Electron Auto-Updater Module
 *
 * Integrates electron-updater for automatic application updates.
 * Uses GitHub Releases as the update source.
 *
 * In development (not packaged), auto-update is disabled since
 * there's no installed app to update.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('AutoUpdater');

/**
 * Current update state sent to renderer via IPC
 */
interface UpdateState {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';
  info?: UpdateInfo;
  progress?: ProgressInfo;
  error?: string;
}

let currentState: UpdateState = { status: 'idle' };
let mainWindow: BrowserWindow | null = null;

/**
 * Send update state to the renderer process
 */
function notifyRenderer(state: UpdateState): void {
  currentState = state;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:state-changed', state);
  }
}

/**
 * Initialize the auto-updater.
 * Call this after the main window is created and the app is ready.
 */
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;

  // Skip auto-update in development
  if (!app.isPackaged) {
    logger.info('Skipping auto-updater in development mode');
    return;
  }

  // Configure updater
  autoUpdater.autoDownload = false; // Let user decide when to download
  autoUpdater.autoInstallOnAppQuit = true; // Install on quit after download
  autoUpdater.logger = {
    info: (message: string) => logger.info(message),
    warn: (message: string) => logger.warn(message),
    error: (message: string) => logger.error(message),
    debug: (message: string) => logger.debug(message),
  };

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for updates...');
    notifyRenderer({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(`Update available: ${info.version}`);
    notifyRenderer({ status: 'available', info });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logger.info(`No update available (current: ${app.getVersion()}, latest: ${info.version})`);
    notifyRenderer({ status: 'not-available', info });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    logger.debug(`Download progress: ${progress.percent.toFixed(1)}%`);
    notifyRenderer({ status: 'downloading', progress });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logger.info(`Update downloaded: ${info.version}`);
    notifyRenderer({ status: 'downloaded', info });
  });

  autoUpdater.on('error', (error: Error) => {
    logger.error('Auto-updater error:', error.message);
    notifyRenderer({ status: 'error', error: error.message });
  });

  // Register IPC handlers for renderer control
  registerIpcHandlers();

  // Check for updates after a short delay (don't block startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.warn('Initial update check failed:', err.message);
    });
  }, 5000);
}

/**
 * Register IPC handlers for update operations
 */
function registerIpcHandlers(): void {
  // Get current update state
  ipcMain.handle('updater:getState', () => {
    return currentState;
  });

  // Manually trigger update check
  ipcMain.handle('updater:checkForUpdates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Download the available update
  ipcMain.handle('updater:downloadUpdate', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Install update and restart
  ipcMain.handle('updater:installUpdate', () => {
    autoUpdater.quitAndInstall(false, true);
  });
}
