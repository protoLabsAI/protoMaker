/**
 * Agent Templates Query Hooks
 *
 * React Query hooks for fetching agent templates from the registry API.
 * Templates define agent roles with metadata (displayName, description, tier).
 */

import { useQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';

const TEMPLATES_REFETCH_ON_FOCUS = false;
const TEMPLATES_REFETCH_ON_RECONNECT = false;

export interface AgentTemplateMetadata {
  name: string;
  displayName: string;
  description: string;
  role: string;
  tier: number;
  model?: string;
  tags?: string[];
}

/**
 * Fetch all registered agent templates from the registry
 *
 * @param role - Optional role filter
 * @returns Query result with templates array
 *
 * @example
 * ```tsx
 * const { data: templates, isLoading, error } = useAgentTemplates();
 * ```
 */
export function useAgentTemplates(role?: string) {
  return useQuery({
    queryKey: queryKeys.agentTemplates.all(role),
    queryFn: async (): Promise<AgentTemplateMetadata[]> => {
      const api = getElectronAPI();
      const result = await api.agentTemplates?.list(role);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch agent templates');
      }
      return result.templates ?? [];
    },
    staleTime: STALE_TIMES.LONG, // Templates don't change often
    refetchOnWindowFocus: TEMPLATES_REFETCH_ON_FOCUS,
    refetchOnReconnect: TEMPLATES_REFETCH_ON_RECONNECT,
  });
}
