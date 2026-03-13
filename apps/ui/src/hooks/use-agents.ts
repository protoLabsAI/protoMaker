/**
 * Agents Query Hook
 *
 * React Query hook for fetching project agents (built-in + project-manifest).
 * Calls POST /api/agents/list which returns all agents merged with project overrides.
 */

import { useQuery } from '@tanstack/react-query';
import { apiPost } from '@/lib/api-fetch';
import type { ProjectAgent } from '@protolabsai/types';

interface AgentsListResponse {
  success: boolean;
  projectPath: string;
  count: number;
  agents: ProjectAgent[];
  error?: string;
}

const AGENTS_STALE_TIME = 5 * 60 * 1000; // 5 minutes — agents don't change often

/**
 * Fetch all agents for a project (built-in + project-manifest overrides).
 *
 * @param projectPath - Path to the project
 * @returns Query result with agents array
 *
 * @example
 * ```tsx
 * const { data: agents = [], isLoading } = useAgents(currentProject?.path);
 * ```
 */
export function useAgents(projectPath: string | undefined) {
  return useQuery({
    queryKey: ['agents', 'list', projectPath],
    queryFn: async (): Promise<ProjectAgent[]> => {
      if (!projectPath) throw new Error('No project path');

      const result = await apiPost<AgentsListResponse>('/api/agents/list', { projectPath });

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch agents');
      }

      return result.agents ?? [];
    },
    enabled: !!projectPath,
    staleTime: AGENTS_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}
