/**
 * React Query Persistence Configuration
 *
 * Sets up IndexedDB persistence for React Query cache to enable offline reads
 * and instant data display on page refresh (PWA functionality).
 *
 * Only active in web mode - Electron has no benefit from IDB persistence.
 */

// @ts-expect-error -- optional dependency, may not be installed
import { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
// @ts-expect-error -- optional dependency, may not be installed
import { del, get, set } from 'idb-keyval';

/**
 * Creates an IndexedDB persister for React Query cache
 * Uses idb-keyval for simple key-value storage in IndexedDB
 */
export function createIDBPersister(idbValidKey: IDBValidKey = 'automaker-query-cache'): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(idbValidKey, client);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(idbValidKey);
    },
    removeClient: async () => {
      await del(idbValidKey);
    },
  };
}

/**
 * Check if we should enable IDB persistence
 * Only enable in web mode (not Electron) to avoid unnecessary overhead
 */
export function shouldEnablePersistence(): boolean {
  // Check if running in Electron mode (VITE_SKIP_ELECTRON is NOT true means we're in Electron)
  const isWebMode = import.meta.env.VITE_SKIP_ELECTRON === 'true';
  return isWebMode;
}
