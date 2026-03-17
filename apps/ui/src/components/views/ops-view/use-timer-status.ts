/**
 * Timer Status Hook
 *
 * Fetches timer registry data from GET /api/ops/timers and provides
 * mutation functions for pause/resume operations.
 * Auto-refreshes every 60 seconds.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost, apiPut } from '@/lib/api-fetch';
import type { TimerRegistryEntry, TimerCategory } from '@protolabsai/types';

interface TimersResponse {
  timers: TimerRegistryEntry[];
  count: number;
}

interface TimerMutationResponse {
  success: boolean;
  error?: string;
  pausedCount?: number;
  resumedCount?: number;
}

interface GlobalSettingsResponse {
  success: boolean;
  settings?: {
    schedulerSettings?: {
      taskOverrides?: Record<string, { enabled?: boolean; cronExpression?: string }>;
    };
  };
}

interface UseTimerStatusResult {
  timers: TimerRegistryEntry[];
  taskOverrides: Record<string, { enabled?: boolean; cronExpression?: string }>;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refetch: () => void;
  pauseTimer: (id: string) => Promise<boolean>;
  resumeTimer: (id: string) => Promise<boolean>;
  pauseAll: () => Promise<boolean>;
  resumeAll: () => Promise<boolean>;
  setTaskEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  timersByCategory: Map<TimerCategory, TimerRegistryEntry[]>;
}

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Group timers by their category for collapsible section rendering.
 */
function groupByCategory(timers: TimerRegistryEntry[]): Map<TimerCategory, TimerRegistryEntry[]> {
  const grouped = new Map<TimerCategory, TimerRegistryEntry[]>();
  for (const timer of timers) {
    const existing = grouped.get(timer.category);
    if (existing) {
      existing.push(timer);
    } else {
      grouped.set(timer.category, [timer]);
    }
  }
  return grouped;
}

export function useTimerStatus(): UseTimerStatusResult {
  const [timers, setTimers] = useState<TimerRegistryEntry[]>([]);
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, { enabled?: boolean; cronExpression?: string }>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTimers = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const result = await apiGet<TimersResponse>('/api/ops/timers');
      if (fetchId !== fetchIdRef.current) return;
      setTimers(result.timers);
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch timers');
      setTimers([]);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const fetchTaskOverrides = useCallback(async () => {
    try {
      const result = await apiGet<GlobalSettingsResponse>('/api/settings/global');
      if (result.success && result.settings?.schedulerSettings?.taskOverrides) {
        setTaskOverrides(result.settings.schedulerSettings.taskOverrides);
      }
    } catch {
      // Non-fatal: overrides default to empty (all tasks enabled)
    }
  }, []);

  useEffect(() => {
    fetchTimers();
    fetchTaskOverrides();
    intervalRef.current = setInterval(fetchTimers, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTimers, fetchTaskOverrides]);

  const pauseTimer = useCallback(
    async (id: string): Promise<boolean> => {
      setIsMutating(true);
      try {
        const result = await apiPost<TimerMutationResponse>(`/api/ops/timers/${id}/pause`);
        if (result.success) {
          await fetchTimers();
          return true;
        }
        throw new Error(result.error ?? 'Failed to pause timer');
      } finally {
        setIsMutating(false);
      }
    },
    [fetchTimers]
  );

  const resumeTimer = useCallback(
    async (id: string): Promise<boolean> => {
      setIsMutating(true);
      try {
        const result = await apiPost<TimerMutationResponse>(`/api/ops/timers/${id}/resume`);
        if (result.success) {
          await fetchTimers();
          return true;
        }
        throw new Error(result.error ?? 'Failed to resume timer');
      } finally {
        setIsMutating(false);
      }
    },
    [fetchTimers]
  );

  const pauseAll = useCallback(async (): Promise<boolean> => {
    setIsMutating(true);
    try {
      const result = await apiPost<TimerMutationResponse>('/api/ops/timers/pause-all');
      if (result.success) {
        await fetchTimers();
        return true;
      }
      throw new Error(result.error ?? 'Failed to pause all timers');
    } finally {
      setIsMutating(false);
    }
  }, [fetchTimers]);

  const resumeAll = useCallback(async (): Promise<boolean> => {
    setIsMutating(true);
    try {
      const result = await apiPost<TimerMutationResponse>('/api/ops/timers/resume-all');
      if (result.success) {
        await fetchTimers();
        return true;
      }
      throw new Error(result.error ?? 'Failed to resume all timers');
    } finally {
      setIsMutating(false);
    }
  }, [fetchTimers]);

  const setTaskEnabled = useCallback(
    async (id: string, enabled: boolean): Promise<boolean> => {
      const prevOverrides = taskOverrides;
      const newOverrides = {
        ...taskOverrides,
        [id]: { ...taskOverrides[id], enabled },
      };
      // Optimistic update
      setTaskOverrides(newOverrides);
      try {
        const result = await apiPut<{ success: boolean; error?: string }>('/api/settings/global', {
          schedulerSettings: { taskOverrides: newOverrides },
        });
        if (result.success) {
          return true;
        }
        throw new Error(result.error ?? 'Failed to update task setting');
      } catch (err) {
        // Revert on failure
        setTaskOverrides(prevOverrides);
        throw err;
      }
    },
    [taskOverrides]
  );

  const timersByCategory = groupByCategory(timers);

  return {
    timers,
    taskOverrides,
    isLoading,
    isMutating,
    error,
    refetch: fetchTimers,
    pauseTimer,
    resumeTimer,
    pauseAll,
    resumeAll,
    setTaskEnabled,
    timersByCategory,
  };
}
