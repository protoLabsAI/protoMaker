/**
 * Project Health Hook
 *
 * Fetches and manages project health data including:
 * - Board state (feature counts by status)
 * - Running agents count
 * - Auto-mode status
 *
 * Data refreshes via polling and WebSocket events
 */

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import type { AutoModeEvent } from '@/types/api';
import type { Feature } from '@/store/types';

const POLL_INTERVAL = 30000; // 30 seconds

export interface BoardCounts {
  backlog: number;
  inProgress: number;
  review: number;
  done: number;
  total: number;
}

export interface ProjectHealthData {
  boardCounts: BoardCounts;
  runningAgentsCount: number;
  autoModeStatus: 'running' | 'stopped' | 'idle';
  isLoading: boolean;
  error?: Error;
}

/**
 * Custom hook to fetch and manage project health data
 *
 * @param projectPath - The current project path
 * @returns Project health data with board counts, running agents, and auto-mode status
 */
export function useProjectHealth(projectPath: string | undefined): ProjectHealthData {
  const queryClient = useQueryClient();

  // Fetch features summary for board counts
  const {
    data: features,
    isLoading: featuresLoading,
    error: featuresError,
  } = useQuery({
    queryKey: queryKeys.features.all(projectPath || ''),
    queryFn: async (): Promise<Feature[]> => {
      if (!projectPath) return [];
      const api = getElectronAPI();
      const result = await api.features?.getAll(projectPath);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch features');
      }
      return (result.features ?? []) as Feature[];
    },
    enabled: !!projectPath,
    refetchInterval: POLL_INTERVAL,
    staleTime: 10000, // Consider data stale after 10s
  });

  // Fetch running agents count
  const {
    data: runningAgentsData,
    isLoading: agentsLoading,
    error: agentsError,
  } = useQuery({
    queryKey: queryKeys.runningAgents.all(),
    queryFn: async () => {
      const api = getElectronAPI();
      const result = await api.runningAgents?.getAll();
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch running agents');
      }
      return {
        agents: result.runningAgents ?? [],
        count: result.totalCount ?? 0,
      };
    },
    refetchInterval: POLL_INTERVAL,
    staleTime: 10000,
  });

  // Fetch auto-mode status
  const {
    data: autoModeStatus,
    isLoading: statusLoading,
    error: statusError,
  } = useQuery({
    queryKey: queryKeys.autoMode.status(projectPath),
    queryFn: async () => {
      if (!projectPath) return { isAutoLoopRunning: false };
      const api = getElectronAPI();
      const result = await api.autoMode?.status(projectPath, null);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch auto-mode status');
      }
      return {
        isAutoLoopRunning: result.isAutoLoopRunning || false,
      };
    },
    enabled: !!projectPath,
    refetchInterval: POLL_INTERVAL,
    staleTime: 10000,
  });

  // Subscribe to WebSocket events to invalidate queries
  useEffect(() => {
    if (!projectPath) return;

    const api = getElectronAPI();
    const unsubscribe = api.autoMode?.onEvent((event: AutoModeEvent) => {
      // Invalidate features when they change
      if (
        event.type === 'auto_mode_feature_complete' ||
        event.type === 'auto_mode_feature_start' ||
        event.type === 'auto_mode_error'
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(projectPath),
        });
      }

      // Invalidate running agents on status changes
      if (
        event.type === 'auto_mode_feature_start' ||
        event.type === 'auto_mode_feature_complete' ||
        event.type === 'auto_mode_error' ||
        event.type === 'auto_mode_resuming_features'
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.runningAgents.all(),
        });
      }

      // Invalidate auto-mode status on start/stop
      if (event.type === 'auto_mode_started' || event.type === 'auto_mode_stopped') {
        queryClient.invalidateQueries({
          queryKey: queryKeys.autoMode.status(projectPath),
        });
      }
    });

    return unsubscribe;
  }, [projectPath, queryClient]);

  // Calculate board counts from features
  const boardCounts: BoardCounts = useMemo(() => {
    if (!features) {
      return { backlog: 0, inProgress: 0, review: 0, done: 0, total: 0 };
    }

    return features.reduce(
      (acc: BoardCounts, feature: Feature) => {
        const status = feature.status?.toLowerCase() || 'backlog';
        if (status === 'backlog') acc.backlog++;
        else if (status === 'in-progress') acc.inProgress++;
        else if (status === 'review') acc.review++;
        else if (status === 'done') acc.done++;
        acc.total++;
        return acc;
      },
      { backlog: 0, inProgress: 0, review: 0, done: 0, total: 0 }
    );
  }, [features]);

  // Determine auto-mode status
  const runningAgentsCount = runningAgentsData?.count || 0;
  const isAutoLoopRunning = autoModeStatus?.isAutoLoopRunning || false;

  let autoModeStatusValue: 'running' | 'stopped' | 'idle';
  if (isAutoLoopRunning && runningAgentsCount > 0) {
    autoModeStatusValue = 'running';
  } else if (isAutoLoopRunning && runningAgentsCount === 0) {
    autoModeStatusValue = 'idle';
  } else {
    autoModeStatusValue = 'stopped';
  }

  const isLoading = featuresLoading || agentsLoading || statusLoading;
  const error = (featuresError || agentsError || statusError) as Error | undefined;

  return {
    boardCounts,
    runningAgentsCount,
    autoModeStatus: autoModeStatusValue,
    isLoading,
    error,
  };
}
