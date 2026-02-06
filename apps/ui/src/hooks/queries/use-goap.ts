/**
 * GOAP Brain Loop Query Hook
 *
 * React Query hook for fetching GOAP loop status.
 * Falls back to polling at 5s intervals as a safety net;
 * primary updates come via WebSocket events.
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';

const GOAP_REFETCH_INTERVAL = 5000;

export interface GOAPStatusResponse {
  success: boolean;
  status: {
    projectPath: string;
    branchName: string | null;
    isRunning: boolean;
    isPaused: boolean;
    tickCount: number;
    lastWorldState: {
      id: string;
      projectPath: string;
      state: Record<string, boolean | number | string>;
      capturedAt: string;
      evaluationDurationMs: number;
    } | null;
    unsatisfiedGoals: Array<{
      id: string;
      name: string;
      conditions: Array<{ key: string; value: boolean | number | string; operator?: string }>;
      priority: number;
    }>;
    availableActions: Array<{
      id: string;
      name: string;
      preconditions: Array<{ key: string; value: boolean | number | string }>;
      effects: Array<{ key: string; value: boolean | number | string }>;
      cost: number;
    }>;
    lastAction: {
      action: { id: string; name: string };
      success: boolean;
      error?: string;
      startedAt: string;
      completedAt: string;
      durationMs: number;
    } | null;
    actionHistory: Array<{
      action: { id: string; name: string };
      success: boolean;
      error?: string;
      startedAt: string;
      completedAt: string;
      durationMs: number;
    }>;
    consecutiveErrors: number;
    lastError?: string;
    startedAt: string;
    lastTickAt?: string;
  } | null;
  running: boolean;
  error?: string;
}

export function useGOAPStatus(projectPath: string | undefined) {
  return useQuery({
    queryKey: ['goap', 'status', projectPath],
    queryFn: async (): Promise<GOAPStatusResponse> => {
      if (!projectPath) {
        return { success: true, status: null, running: false };
      }
      const api = getElectronAPI();
      return (api as any).goap.status(projectPath);
    },
    enabled: !!projectPath,
    refetchInterval: GOAP_REFETCH_INTERVAL,
  });
}
