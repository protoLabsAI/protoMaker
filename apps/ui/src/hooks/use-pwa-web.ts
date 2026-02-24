import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * PWA hook for web mode
 * This file is only imported in web builds (VITE_SKIP_ELECTRON=true)
 */
export function usePWAWeb() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (import.meta.env.DEV) {
        console.log('Service Worker registered:', registration);
      }
    },
    onRegisterError(error) {
      console.error('Service Worker registration error:', error);
    },
  });

  return {
    needRefresh,
    offlineReady,
    updateSW: updateServiceWorker,
    close: () => {
      setNeedRefresh(false);
      setOfflineReady(false);
    },
  };
}
