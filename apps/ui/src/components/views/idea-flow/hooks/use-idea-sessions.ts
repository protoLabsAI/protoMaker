/**
 * Idea Sessions Query Hook
 *
 * React Query hook for fetching idea processing sessions with automatic refresh.
 * Calls GET /api/ideas directly (the idea processing service endpoint).
 */

import { useQuery } from '@tanstack/react-query';
import type { IdeationSession, IdeationSessionStatus } from '@automaker/types';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import { getAuthHeaders } from '@/lib/api-fetch';

interface IdeaSessionsResult {
  sessions: IdeationSession[];
  count: number;
}

/**
 * Map server session status to UI session status
 *
 * Server uses: 'processing' | 'awaiting_approval' | 'completed' | 'failed'
 * UI uses: 'active' | 'completed' | 'abandoned'
 */
function mapSessionStatus(serverStatus: string): IdeationSessionStatus {
  switch (serverStatus) {
    case 'processing':
    case 'awaiting_approval':
      return 'active';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'abandoned';
    default:
      return 'active';
  }
}

/**
 * Fetch all idea processing sessions
 *
 * @param projectPath - Path to the project
 * @returns Query result with sessions array, loading state, and error
 */
export function useIdeaSessions(projectPath: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.ideation.ideas(projectPath ?? ''),
    queryFn: async (): Promise<IdeaSessionsResult> => {
      if (!projectPath) throw new Error('No project path');

      const response = await fetch('/api/ideas', {
        headers: {
          ...getAuthHeaders(),
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch idea sessions: ${response.status}`);
      }

      const result = await response.json();

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch idea sessions');
      }

      // Server returns { sessions: IdeaSession[] } — map to IdeationSession format
      const serverSessions = (result.sessions ?? []) as Array<Record<string, unknown>>;

      const sessions: IdeationSession[] = serverSessions.map((s) => ({
        id: s.id as string,
        projectPath,
        status: mapSessionStatus(s.status as string),
        createdAt: s.createdAt as string,
        updatedAt: s.updatedAt as string,
      }));

      return {
        sessions,
        count: sessions.length,
      };
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.FEATURES,
    refetchInterval: 10000,
  });

  return query;
}
