/**
 * Electron preload script (TypeScript)
 *
 * Only exposes native features (dialogs, shell) and server URL.
 * All other operations go through HTTP API.
 */

import { contextBridge, ipcRenderer, OpenDialogOptions, SaveDialogOptions } from 'electron';
import { createLogger } from '@protolabs-ai/utils/logger';

const logger = createLogger('Preload');

// Expose minimal API for native features
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Connection check
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),

  // Get server URL for HTTP client
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('server:getUrl'),

  // Get API key for authentication
  getApiKey: (): Promise<string | null> => ipcRenderer.invoke('auth:getApiKey'),

  // Check if running in external server mode (Docker API)
  isExternalServerMode: (): Promise<boolean> => ipcRenderer.invoke('auth:isExternalServerMode'),

  // Native dialogs - better UX than prompt()
  openDirectory: (): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke('dialog:openDirectory'),
  openFile: (options?: OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options?: SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> =>
    ipcRenderer.invoke('dialog:saveFile', options),

  // Shell operations
  openExternalLink: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:openExternal', url),
  openPath: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:openPath', filePath),
  openInEditor: (
    filePath: string,
    line?: number,
    column?: number
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:openInEditor', filePath, line, column),

  // App info
  getPath: (name: string): Promise<string> => ipcRenderer.invoke('app:getPath', name),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  isPackaged: (): Promise<boolean> => ipcRenderer.invoke('app:isPackaged'),

  // Window management
  updateMinWidth: (sidebarExpanded: boolean): Promise<void> =>
    ipcRenderer.invoke('window:updateMinWidth', sidebarExpanded),

  // App control
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),

  // Ava Anywhere overlay
  toggleOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:toggle'),
  hideOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:hide'),
  showOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:show'),
  startHide: (): void => ipcRenderer.send('overlay:start-hide'),
  resizeOverlay: (height: number): Promise<void> => ipcRenderer.invoke('overlay:resize', height),
  setOverlayShortcut: (accelerator: string): Promise<boolean> =>
    ipcRenderer.invoke('overlay:set-shortcut', accelerator),
  onOverlayDidShow: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('overlay:did-show', handler);
    return () => ipcRenderer.removeListener('overlay:did-show', handler);
  },
  onOverlayHideRequested: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('overlay:hide-requested', handler);
    return () => ipcRenderer.removeListener('overlay:hide-requested', handler);
  },

  // Auto-updater
  updater: {
    getState: (): Promise<{
      status: string;
      info?: unknown;
      progress?: unknown;
      error?: string;
    }> => ipcRenderer.invoke('updater:getState'),
    checkForUpdates: (): Promise<{ success: boolean; updateInfo?: unknown; error?: string }> =>
      ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('updater:downloadUpdate'),
    installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:installUpdate'),
    onStateChanged: (callback: (state: unknown) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on('updater:state-changed', handler);
      return () => ipcRenderer.removeListener('updater:state-changed', handler);
    },
  },
});

logger.info('Electron API exposed (TypeScript)');
