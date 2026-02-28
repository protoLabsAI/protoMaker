/**
 * Reaction Abilities Query Hooks
 *
 * React Query hooks for fetching and updating Discord reaction abilities.
 * Reaction abilities are emoji-triggered workflow intents configured per project.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api-fetch';
import { queryKeys } from '@/lib/query-keys';
import type { ReactionAbility } from '@protolabs-ai/types';

const STALE_TIME = 30 * 1000; // 30 seconds

interface ReactionAbilitiesResponse {
  abilities: ReactionAbility[];
}

/**
 * Fetch reaction abilities for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with abilities array
 *
 * @example
 * ```tsx
 * const { data: abilities, isLoading } = useReactionAbilities(projectPath);
 * ```
 */
export function useReactionAbilities(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.discord.reactionAbilities(projectPath ?? ''),
    queryFn: async (): Promise<ReactionAbility[]> => {
      if (!projectPath) throw new Error('No project path');
      const params = new URLSearchParams({ projectPath });
      const result = await apiGet<ReactionAbilitiesResponse>(
        `/api/discord/reaction-abilities?${params.toString()}`
      );
      return result.abilities ?? [];
    },
    enabled: !!projectPath,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/**
 * Mutation to save the full list of reaction abilities for a project
 *
 * @param projectPath - Path to the project
 * @returns Mutation result
 *
 * @example
 * ```tsx
 * const { mutate: saveAbilities, isPending } = useSaveReactionAbilities(projectPath);
 * saveAbilities(updatedAbilities);
 * ```
 */
export function useSaveReactionAbilities(projectPath: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (abilities: ReactionAbility[]): Promise<ReactionAbility[]> => {
      if (!projectPath) throw new Error('No project path');
      const result = await apiPut<ReactionAbilitiesResponse>('/api/discord/reaction-abilities', {
        projectPath,
        abilities,
      });
      return result.abilities ?? [];
    },
    onSuccess: (abilities) => {
      queryClient.setQueryData(queryKeys.discord.reactionAbilities(projectPath ?? ''), abilities);
    },
  });
}
