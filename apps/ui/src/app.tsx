import { useState, useCallback, useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { createLogger } from '@automaker/utils/logger';
import { router } from './utils/router';
import { SplashScreen } from './components/splash-screen';
import { useSettingsSync } from './hooks/use-settings-sync';
import { useCursorStatusInit } from './hooks/use-cursor-status-init';
import { useProviderAuthInit } from './hooks/use-provider-auth-init';
import { usePWA } from './hooks/use-pwa';
import { toast } from 'sonner';
import './styles/global.css';
import './styles/theme-imports';
import './styles/font-imports';

const logger = createLogger('App');

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    // Skip splash in CI/test environments
    if (import.meta.env.VITE_SKIP_SETUP === 'true') {
      return false;
    }
    // Only show splash once per session
    if (sessionStorage.getItem('automaker-splash-shown')) {
      return false;
    }
    return true;
  });

  // Clear accumulated PerformanceMeasure entries to prevent memory leak in dev mode
  // React's internal scheduler creates performance marks/measures that accumulate without cleanup
  useEffect(() => {
    if (import.meta.env.DEV) {
      const clearPerfEntries = () => {
        // Check if window.performance is available before calling its methods
        if (window.performance) {
          window.performance.clearMarks();
          window.performance.clearMeasures();
        }
      };
      const interval = setInterval(clearPerfEntries, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  // Settings are now loaded in __root.tsx after successful session verification
  // This ensures a unified flow: verify session → load settings → redirect
  // We no longer block router rendering here - settings loading happens in __root.tsx

  // Sync settings changes back to server (API-first persistence)
  const settingsSyncState = useSettingsSync();
  if (settingsSyncState.error) {
    logger.error('Settings sync error:', settingsSyncState.error);
  }

  // Initialize Cursor CLI status at startup
  useCursorStatusInit();

  // Initialize Provider auth status at startup (for Claude/Codex usage display)
  useProviderAuthInit();

  // Initialize PWA (only registers in web mode, not Electron)
  const pwa = usePWA();

  // Show toast notifications for PWA updates and offline readiness
  useEffect(() => {
    if (pwa.needRefresh) {
      toast('Update available', {
        description: 'A new version is available. Click to update.',
        action: {
          label: 'Update',
          onClick: () => {
            pwa.updateSW(true);
            pwa.close();
          },
        },
        duration: Infinity,
      });
    }

    if (pwa.offlineReady) {
      toast.success('App ready to work offline', {
        description: 'The app is cached and ready to work offline.',
        duration: 5000,
      });
    }
  }, [pwa.needRefresh, pwa.offlineReady, pwa]);

  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem('automaker-splash-shown', 'true');
    setShowSplash(false);
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    </>
  );
}
