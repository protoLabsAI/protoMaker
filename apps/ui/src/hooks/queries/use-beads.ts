/**
 * Beads Query Hook
 *
 * Fetches all non-tombstoned issues from the project's `.beads/` tracker via
 * the `/api/beads/list` endpoint.
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import type { BeadsIssue } from '@protolabsai/types';

// Polls every 2s while the panel is visible. React Query auto-pauses polling
// when the tab is hidden (refetchIntervalInBackground: false), so cost is
// bounded to ~1 `br` subprocess every 2s while the user is actively looking
// at the view. This gives near-live updates without a server-side watcher.
const BEADS_LIVE_POLL_MS = 2_000;

/**
 * Whether the current project has an initialized `.beads/` store. Drives the
 * "Initialize beads" affordance in the Beads view. Polled less aggressively
 * than the issue list — init is a one-time, user-driven action.
 */
export function useBeadsStatus(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.beads.status(projectPath ?? ''),
    queryFn: async (): Promise<boolean> => {
      if (!projectPath) throw new Error('No project path');
      const client = getHttpApiClient();
      const result = await client.beads.status(projectPath);
      if (!result?.success) throw new Error('Failed to fetch beads status');
      return result.initialized;
    },
    enabled: !!projectPath,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useBeadsList(projectPath: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.beads.list(projectPath ?? ''),
    queryFn: async (): Promise<BeadsIssue[]> => {
      if (!projectPath) throw new Error('No project path');
      const client = getHttpApiClient();
      const result = await client.beads.list(projectPath);
      if (!result?.success) throw new Error('Failed to fetch beads issues');
      return result.issues ?? [];
    },
    enabled: !!projectPath && options?.enabled !== false,
    staleTime: 1_000,
    refetchInterval: BEADS_LIVE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useBeadsReady(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.beads.ready(projectPath ?? ''),
    queryFn: async (): Promise<BeadsIssue[]> => {
      if (!projectPath) throw new Error('No project path');
      const client = getHttpApiClient();
      const result = await client.beads.ready(projectPath);
      if (!result?.success) throw new Error('Failed to fetch ready issues');
      return result.issues ?? [];
    },
    enabled: !!projectPath,
    staleTime: 1_000,
    refetchInterval: BEADS_LIVE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
