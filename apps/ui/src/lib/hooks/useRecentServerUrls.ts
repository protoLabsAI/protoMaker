/**
 * Custom hook for managing recent server URLs.
 *
 * Provides access to the recentServerUrls list from app-store, which is
 * persisted via localStorage (max 10, deduplicated). Also exposes helpers
 * to add a URL to the list and to set the active server URL override.
 */
import { useAppStore } from '@/store/app-store';

export interface UseRecentServerUrlsReturn {
  /** Recently used server URLs, max 10, deduplicated. Persisted in localStorage. */
  recentServerUrls: string[];
  /** Current server URL override (null = use env var / default). */
  serverUrlOverride: string | null;
  /** Add a URL to recentServerUrls (deduplicated, max 10). */
  addRecentServerUrl: (url: string) => void;
  /** Set the active server URL override, persist to localStorage, and trigger WebSocket reconnection. */
  setServerUrlOverride: (url: string | null) => void;
}

export function useRecentServerUrls(): UseRecentServerUrlsReturn {
  const recentServerUrls = useAppStore((s) => s.recentServerUrls);
  const serverUrlOverride = useAppStore((s) => s.serverUrlOverride);
  const addRecentServerUrl = useAppStore((s) => s.addRecentServerUrl);
  const setServerUrlOverride = useAppStore((s) => s.setServerUrlOverride);

  return {
    recentServerUrls,
    serverUrlOverride,
    addRecentServerUrl,
    setServerUrlOverride,
  };
}
