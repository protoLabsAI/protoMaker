/**
 * Maintenance Status Hook
 *
 * Fetches detailed health data from GET /api/health/detailed to display
 * the latest maintenance sweep results, environment info, and sync status.
 * Auto-refreshes every 60 seconds.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet } from '@/lib/api-fetch';

interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
}

interface AuthInfo {
  mode: string;
  [key: string]: unknown;
}

interface SyncStatus {
  [key: string]: unknown;
}

export interface DetailedHealthData {
  status: string;
  timestamp: string;
  version: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  dataDir: string;
  auth: AuthInfo;
  env: EnvironmentInfo;
  sync: SyncStatus | null;
}

interface UseMaintenanceStatusResult {
  health: DetailedHealthData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const REFRESH_INTERVAL_MS = 60_000;

export function useMaintenanceStatus(): UseMaintenanceStatusResult {
  const [health, setHealth] = useState<DetailedHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const result = await apiGet<DetailedHealthData>('/api/health/detailed');
      if (fetchId !== fetchIdRef.current) return;
      setHealth(result);
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch health data');
      setHealth(null);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    intervalRef.current = setInterval(fetchHealth, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchHealth]);

  return {
    health,
    isLoading,
    error,
    refetch: fetchHealth,
  };
}
