/**
 * Metrics Query Hooks
 *
 * React Query hooks for fetching project metrics, capacity, and forecasts.
 * Uses HTTP API client directly (metrics are HTTP-only, not in Electron bridge).
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import type { TimeSeriesMetric, TimeGroupBy } from '@protolabsai/types';

const DORA_STALE_TIME = 60 * 1000; // 1 minute
const METRICS_STALE_TIME = 30 * 1000; // 30 seconds
const CAPACITY_STALE_TIME = 10 * 1000; // 10 seconds
const LEDGER_STALE_TIME = 60 * 1000; // 1 minute

/**
 * Fetch DORA metrics (lead time, deployment frequency, change failure rate, recovery time, rework rate)
 */
export function useDora(projectPath: string | undefined, timeWindowDays?: number) {
  return useQuery({
    queryKey: queryKeys.dora.metrics(projectPath ?? ''),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.dora.metrics(projectPath, timeWindowDays);
    },
    enabled: !!projectPath,
    staleTime: DORA_STALE_TIME,
    refetchInterval: DORA_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

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

/**
 * Fetch aggregate metrics from the persistent ledger (survives archival)
 */
export function useLedgerAggregate(
  projectPath: string | undefined,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: queryKeys.metrics.ledgerAggregate(projectPath ?? '', startDate, endDate),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.metrics.ledgerAggregate(projectPath, { startDate, endDate });
    },
    enabled: !!projectPath,
    staleTime: LEDGER_STALE_TIME,
    refetchInterval: LEDGER_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch time series data from the ledger for charts
 */
export function useTimeSeries(
  projectPath: string | undefined,
  metric: TimeSeriesMetric,
  groupBy: TimeGroupBy,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: queryKeys.metrics.timeSeries(projectPath ?? '', metric, groupBy, startDate, endDate),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.metrics.timeSeries(projectPath, metric, groupBy, { startDate, endDate });
    },
    enabled: !!projectPath,
    staleTime: LEDGER_STALE_TIME,
    refetchInterval: LEDGER_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch model cost distribution for pie chart
 */
export function useModelDistribution(
  projectPath: string | undefined,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: queryKeys.metrics.modelDistribution(projectPath ?? '', startDate, endDate),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.metrics.modelDistribution(projectPath, { startDate, endDate });
    },
    enabled: !!projectPath,
    staleTime: LEDGER_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch cycle time distribution for histogram
 */
export function useCycleTimeDistribution(
  projectPath: string | undefined,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: queryKeys.metrics.cycleTimeDistribution(projectPath ?? '', startDate, endDate),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.metrics.cycleTimeDistribution(projectPath, { startDate, endDate });
    },
    enabled: !!projectPath,
    staleTime: LEDGER_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

const DORA_HISTORY_STALE_TIME = 60 * 1000; // 1 minute

/**
 * Fetch time-bucketed DORA history snapshots for trend charts.
 * Uses GET /api/metrics/dora/history.
 */
export function useDoraHistory(
  projectPath: string | undefined,
  window: '7d' | '30d' | '90d' = '30d'
) {
  return useQuery({
    queryKey: queryKeys.dora.history(projectPath ?? '', window),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.dora.history(projectPath, window);
    },
    enabled: !!projectPath,
    staleTime: DORA_HISTORY_STALE_TIME,
    refetchInterval: DORA_HISTORY_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

const ENGINE_STATUS_STALE_TIME = 10 * 1000; // 10 seconds
const EVENT_HISTORY_STALE_TIME = 30 * 1000; // 30 seconds

/**
 * Fetch real-time engine status (all services: signal intake, auto-mode, agent execution, etc.)
 */
export function useEngineStatus(projectPath?: string) {
  return useQuery({
    queryKey: queryKeys.engine.status(projectPath),
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.engine.status(projectPath);
    },
    staleTime: ENGINE_STATUS_STALE_TIME,
    refetchInterval: ENGINE_STATUS_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

/**
 * Fetch server-side event history from the ring buffer.
 * Used for scroll-back and filtered queries beyond the 200-event WebSocket buffer.
 */
export function useEventHistory(filter?: {
  type?: string;
  service?: string;
  featureId?: string;
  since?: number;
  until?: number;
  limit?: number;
  _timeRangeMs?: number;
}) {
  return useQuery({
    queryKey: queryKeys.engine.eventsHistory(filter),
    queryFn: async () => {
      const api = getHttpApiClient();
      // Compute `since` at fetch time so the window doesn't drift
      const actualFilter = filter ? { ...filter } : undefined;
      if (actualFilter?._timeRangeMs) {
        actualFilter.since = Date.now() - actualFilter._timeRangeMs;
        delete actualFilter._timeRangeMs;
      }
      return api.engine.eventsHistory(actualFilter);
    },
    enabled: !!filter,
    staleTime: EVENT_HISTORY_STALE_TIME,
    refetchInterval: EVENT_HISTORY_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

const INTEGRATION_STALE_TIME = 30 * 1000; // 30 seconds
const SYSTEM_HEALTH_STALE_TIME = 15 * 1000; // 15 seconds
const ACTIVITY_FEED_STALE_TIME = 10 * 1000; // 10 seconds

/**
 * Fetch integration status for Discord and GitHub
 */
export function useIntegrationStatus(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.integrations.status(projectPath ?? ''),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.integrations.status(projectPath);
    },
    enabled: !!projectPath,
    staleTime: INTEGRATION_STALE_TIME,
    refetchInterval: INTEGRATION_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

/**
 * Fetch system health including memory, CPU, heap, agent count, auto-mode status
 */
export function useSystemHealth(projectPath?: string) {
  return useQuery({
    queryKey: queryKeys.system.healthDashboard(projectPath),
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.system.healthDashboard(projectPath);
    },
    staleTime: SYSTEM_HEALTH_STALE_TIME,
    refetchInterval: SYSTEM_HEALTH_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

/**
 * Fetch recent activity feed events from the event stream
 * Note: This hook aggregates events from the WebSocket connection
 */
export function useActivityFeed(projectPath?: string, limit: number = 50) {
  return useQuery({
    queryKey: queryKeys.activity.feed(projectPath, limit),
    queryFn: async () => {
      const api = getHttpApiClient();
      // Get event history from the API client's event buffer.
      // getRecentEvents is an optional runtime extension (not part of the base class).
      const client = api as unknown as Record<string, unknown>;
      const eventHistory =
        typeof client.getRecentEvents === 'function'
          ? (client.getRecentEvents(limit) as unknown[])
          : [];

      return {
        success: true,
        events: eventHistory.slice(0, limit),
        timestamp: new Date().toISOString(),
      };
    },
    staleTime: ACTIVITY_FEED_STALE_TIME,
    refetchInterval: ACTIVITY_FEED_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
