/**
 * System Health Hook
 *
 * Fetches system health metrics from the existing health dashboard endpoint.
 * Provides memory, CPU, heap, agent count, and auto-mode status.
 * Auto-refreshes every 30 seconds for near-real-time monitoring.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getHttpApiClient, type SystemHealthResponse } from '@/lib/http-api-client';

export type HealthLevel = 'healthy' | 'warning' | 'critical';

interface UseSystemHealthResult {
  health: SystemHealthResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  overallStatus: HealthLevel;
}

const REFRESH_INTERVAL_MS = 30_000;

/** Heap usage thresholds for status determination */
const HEAP_WARNING_THRESHOLD = 0.75;
const HEAP_CRITICAL_THRESHOLD = 0.9;

/** CPU load thresholds */
const CPU_WARNING_THRESHOLD = 0.8;
const CPU_CRITICAL_THRESHOLD = 0.95;

/**
 * Derive the overall system health level from metrics.
 */
function deriveHealthLevel(health: SystemHealthResponse): HealthLevel {
  const heapPercent = health.heap.percentage / 100;
  const cpuPercent = health.cpu.loadPercent / 100;

  if (heapPercent >= HEAP_CRITICAL_THRESHOLD || cpuPercent >= CPU_CRITICAL_THRESHOLD) {
    return 'critical';
  }
  if (heapPercent >= HEAP_WARNING_THRESHOLD || cpuPercent >= CPU_WARNING_THRESHOLD) {
    return 'warning';
  }
  return 'healthy';
}

export function useSystemHealth(projectPath?: string): UseSystemHealthResult {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const api = getHttpApiClient();
      const result = await api.system.healthDashboard(projectPath);
      if (fetchId !== fetchIdRef.current) return;

      if (result.success) {
        setHealth(result);
      } else {
        setError('Failed to fetch system health');
        setHealth(null);
      }
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch system health');
      setHealth(null);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectPath]);

  useEffect(() => {
    fetchHealth();
    intervalRef.current = setInterval(fetchHealth, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchHealth]);

  const overallStatus: HealthLevel = health ? deriveHealthLevel(health) : 'healthy';

  return {
    health,
    isLoading,
    error,
    refetch: fetchHealth,
    overallStatus,
  };
}
