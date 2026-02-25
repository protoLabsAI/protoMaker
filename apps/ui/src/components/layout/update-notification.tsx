import { useEffect, useState, useCallback } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
import { isElectron } from '@/lib/electron';
import { createLogger } from '@protolabs-ai/utils/logger';
import { toast } from 'sonner';

const logger = createLogger('UpdateNotification');

interface UpdateState {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';
  info?: {
    version: string;
    releaseDate?: string;
    releaseName?: string;
    releaseNotes?: string;
  };
  progress?: {
    bytesPerSecond: number;
    percent: number;
    transferred: number;
    total: number;
  };
  error?: string;
}

/**
 * Update notification component that shows download progress
 * and prompts user to restart when update is downloaded.
 */
export function UpdateNotification() {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!isElectron()) {
      return;
    }

    const electronAPI = window.electronAPI;
    if (!electronAPI?.updater) {
      logger.warn('Updater API not available');
      return;
    }

    // Get initial state
    electronAPI.updater
      .getState()
      .then((state) => {
        setUpdateState(state as UpdateState);
      })
      .catch((error) => {
        logger.error('Failed to get initial updater state:', error);
      });

    // Listen for state changes
    const unsubscribe = electronAPI.updater.onStateChanged((state) => {
      const newState = state as UpdateState;
      setUpdateState(newState);

      // Show toast notifications for key events
      if (newState.status === 'available' && newState.info) {
        toast.info(`Update available: v${newState.info.version}`, {
          description: 'A new version is ready to download',
          duration: 10000,
        });
      } else if (newState.status === 'downloaded' && newState.info) {
        toast.success(`Update downloaded: v${newState.info.version}`, {
          description: 'Restart to install the update',
          duration: 0, // Don't auto-dismiss
          action: {
            label: 'Restart Now',
            onClick: handleInstallUpdate,
          },
        });
      } else if (newState.status === 'error') {
        toast.error('Update failed', {
          description: newState.error || 'An error occurred while checking for updates',
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.updater) {
      return;
    }

    setIsDownloading(true);
    try {
      const result = await window.electronAPI.updater.downloadUpdate();
      if (!result.success) {
        logger.error('Failed to download update:', result.error);
        toast.error('Failed to download update', {
          description: result.error,
        });
      }
    } catch (error) {
      logger.error('Download update crashed:', error);
      toast.error('Failed to download update');
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.updater) {
      return;
    }

    try {
      await window.electronAPI.updater.installUpdate();
    } catch (error) {
      logger.error('Install update crashed:', error);
      toast.error('Failed to install update');
    }
  }, []);

  // Don't render anything if not in Electron or no update state
  if (!isElectron() || !updateState) {
    return null;
  }

  // Show download button when update is available
  if (updateState.status === 'available' && updateState.info) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-sidebar border border-sidebar-border rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm">Update Available</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Version {updateState.info.version} is ready to download
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleDownloadUpdate}
                disabled={isDownloading}
                className="text-xs h-7"
              >
                {isDownloading ? 'Downloading...' : 'Download'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setUpdateState(null)}
                className="text-xs h-7"
              >
                Later
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show progress bar when downloading
  if (updateState.status === 'downloading' && updateState.progress) {
    const percent = Math.round(updateState.progress.percent);
    const transferred = (updateState.progress.transferred / 1024 / 1024).toFixed(1);
    const total = (updateState.progress.total / 1024 / 1024).toFixed(1);

    return (
      <div className="fixed bottom-4 right-4 z-50 bg-sidebar border border-sidebar-border rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-brand-500 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm">Downloading Update</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {transferred} MB / {total} MB ({percent}%)
            </p>
            <div className="w-full bg-sidebar-accent/30 rounded-full h-1.5 mt-2">
              <div
                className="bg-brand-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show restart prompt when update is downloaded
  if (updateState.status === 'downloaded' && updateState.info) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-sidebar border border-sidebar-border rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm">Update Ready</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Version {updateState.info.version} has been downloaded
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleInstallUpdate} className="text-xs h-7">
                Restart Now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setUpdateState(null)}
                className="text-xs h-7"
              >
                Later
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
