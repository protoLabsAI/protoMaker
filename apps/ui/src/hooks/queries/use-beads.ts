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

export function useBeadsList(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.beads.list(projectPath ?? ''),
    queryFn: async (): Promise<BeadsIssue[]> => {
      if (!projectPath) throw new Error('No project path');
      const client = getHttpApiClient();
      const result = await client.beads.list(projectPath);
      if (!result?.success) throw new Error('Failed to fetch beads issues');
      return result.issues ?? [];
    },
    enabled: !!projectPath,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
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
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
