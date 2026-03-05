/**
 * usePmSessions — Fetches PM chat sessions for a project.
 *
 * Calls GET /api/project-pm/sessions?projectSlug=<slug> and returns
 * the sessions list via React Query.
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-fetch';

export interface PmSession {
  id: string;
  projectSlug: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface PmSessionsResponse {
  success: boolean;
  sessions: PmSession[];
}

export function usePmSessions(projectSlug: string | null) {
  return useQuery({
    queryKey: ['pm-sessions', projectSlug],
    queryFn: async (): Promise<PmSession[]> => {
      if (!projectSlug) return [];
      const res = await apiGet<PmSessionsResponse>(
        `/api/project-pm/sessions?projectSlug=${encodeURIComponent(projectSlug)}`
      );
      if (!res.success) throw new Error('Failed to fetch PM sessions');
      return res.sessions ?? [];
    },
    enabled: !!projectSlug,
  });
}
