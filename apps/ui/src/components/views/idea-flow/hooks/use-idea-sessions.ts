/**
 * Idea Sessions Query Hook
 *
 * React Query hook for fetching ideation sessions with automatic refresh.
 * Provides real-time updates for active ideation sessions via polling.
 */

import { useQuery } from '@tanstack/react-query';
import type { IdeationSession } from '@automaker/types';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

interface IdeaSessionsResult {
  sessions: IdeationSession[];
  count: number;
}

/**
 * Fetch all ideation sessions for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with sessions array, loading state, and error
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useIdeaSessions(projectPath);
 * const { sessions } = data ?? { sessions: [], count: 0 };
 * ```
 */
export function useIdeaSessions(projectPath: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.ideation.ideas(projectPath ?? ''),
    queryFn: async (): Promise<IdeaSessionsResult> => {
      if (!projectPath) throw new Error('No project path');

      const api = getElectronAPI();
      const result = await api.ideation?.listIdeas(projectPath);

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch ideation sessions');
      }

      // Extract unique session IDs from ideas
      const ideas = result.ideas ?? [];
      const sessionMap = new Map<string, IdeationSession>();

      for (const idea of ideas) {
        if (idea.conversationId) {
          // Create a session record from the idea's conversation metadata
          if (!sessionMap.has(idea.conversationId)) {
            sessionMap.set(idea.conversationId, {
              id: idea.conversationId,
              projectPath,
              promptCategory: idea.category,
              promptId: idea.sourcePromptId,
              status: 'completed', // Ideas that exist are from completed sessions
              createdAt: idea.createdAt,
              updatedAt: idea.updatedAt,
            });
          }
        }
      }

      const sessions = Array.from(sessionMap.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return {
        sessions,
        count: sessions.length,
      };
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.FEATURES,
    // Refetch every 10 seconds to keep sessions up-to-date
    refetchInterval: 10000,
  });

  return query;
}
