/**
 * Custom hook for PWA functionality
 * Exposes service worker update controls and offline status
 *
 * The service worker should NOT be registered in Electron builds (VITE_SKIP_ELECTRON !== 'true')
 * In web mode (VITE_SKIP_ELECTRON === 'true'), this hook registers and manages the SW
 */

// Conditionally import the web implementation only in web builds
// Vite will tree-shake the unused import during build
import { usePWAWeb } from './use-pwa-web';

const isWebMode = import.meta.env.VITE_SKIP_ELECTRON === 'true';

export function usePWA() {
  if (isWebMode) {
    // Web mode - use the actual PWA hook
    // This is safe because isWebMode is a build-time constant
    return usePWAWeb();
  }

  // Electron mode - return no-op implementation
  return {
    needRefresh: false,
    offlineReady: false,
    updateSW: async () => {},
    close: () => {},
  };
}
