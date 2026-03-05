/**
 * Hook for managing user identity for board feature assignment
 *
 * Fetches identity from API and caches it in the app store.
 * Provides methods to get and set the user identity.
 */

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { createLogger } from '@protolabsai/utils/logger';

const logger = createLogger('useUserIdentity');

export function useUserIdentity() {
  const userIdentity = useAppStore((state) => state.userIdentity);
  const setUserIdentity = useAppStore((state) => state.setUserIdentity);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch identity from API on mount if not cached
  useEffect(() => {
    if (userIdentity !== null) {
      // Already cached, skip API call
      return;
    }

    const fetchIdentity = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const httpClient = getHttpApiClient();
        const response = await httpClient.settings.getUserIdentity();

        if (response.success && response.identity) {
          setUserIdentity(response.identity);
        }
      } catch (err) {
        logger.error('Failed to fetch user identity:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch identity');
      } finally {
        setIsLoading(false);
      }
    };

    fetchIdentity();
  }, [userIdentity, setUserIdentity]);

  // Save identity to API and cache
  const saveIdentity = useCallback(
    async (identity: string): Promise<boolean> => {
      try {
        setIsLoading(true);
        setError(null);
        const httpClient = getHttpApiClient();
        const response = await httpClient.settings.setUserIdentity(identity);

        if (response.success && response.identity) {
          setUserIdentity(response.identity);
          return true;
        }

        setError(response.error || 'Failed to save identity');
        return false;
      } catch (err) {
        logger.error('Failed to save user identity:', err);
        setError(err instanceof Error ? err.message : 'Failed to save identity');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [setUserIdentity]
  );

  return {
    userIdentity,
    isLoading,
    error,
    saveIdentity,
  };
}
