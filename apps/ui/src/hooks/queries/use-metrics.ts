/**
 * Metrics Query Hooks
 *
 * React Query hooks for fetching project metrics, capacity, and forecasts.
 * Uses HTTP API client directly (metrics are HTTP-only, not in Electron bridge).
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';

const METRICS_STALE_TIME = 30 * 1000; // 30 seconds
const CAPACITY_STALE_TIME = 10 * 1000; // 10 seconds

/**
 * Fetch project-level aggregated metrics (cost, velocity, success rate, throughput)
 */
export function useProjectMetrics(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.metrics.summary(projectPath ?? ''),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.metrics.summary(projectPath);
    },
    enabled: !!projectPath,
    staleTime: METRICS_STALE_TIME,
    refetchInterval: METRICS_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch capacity utilization metrics (concurrency, backlog, blocked, review)
 */
export function useCapacityMetrics(projectPath: string | undefined, maxConcurrency?: number) {
  return useQuery({
    queryKey: queryKeys.metrics.capacity(projectPath ?? ''),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.metrics.capacity(projectPath, maxConcurrency);
    },
    enabled: !!projectPath,
    staleTime: CAPACITY_STALE_TIME,
    refetchInterval: CAPACITY_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch forecast for a given complexity level
 */
export function useForecast(projectPath: string | undefined, complexity?: string) {
  return useQuery({
    queryKey: queryKeys.metrics.forecast(projectPath ?? '', complexity),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.metrics.forecast(projectPath, complexity);
    },
    enabled: !!projectPath,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
