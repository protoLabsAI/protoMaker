/**
 * GOAP Brain Loop Event Hook
 *
 * Subscribes to GOAP events via Electron IPC (backed by server WebSocket)
 * and invalidates the React Query cache to keep the UI in sync.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';

export function useGOAPEvents(projectPath: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectPath) return;

    const api = getElectronAPI() as any;
    if (!api.goap?.onEvent) return;

    const unsubscribe = api.goap.onEvent((event: any) => {
      // Invalidate the GOAP status query on any GOAP event
      queryClient.invalidateQueries({ queryKey: ['goap', 'status', projectPath] });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [projectPath, queryClient]);
}
