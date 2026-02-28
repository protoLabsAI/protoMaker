/**
 * Signal Channels Query Hooks
 *
 * React Query hooks for reading and updating Discord channel signal configs.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type { DiscordChannelSignalConfig } from '@protolabs-ai/types';

/**
 * Fetch Discord channel signal configs for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with signal channel configs array
 *
 * @example
 * ```tsx
 * const { data: channels, isLoading } = useSignalChannels(currentProject?.path);
 * ```
 */
export function useSignalChannels(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.integrations.signalChannels(projectPath ?? ''),
    queryFn: async (): Promise<DiscordChannelSignalConfig[]> => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      const result = await api.integrations.getSignalChannels(projectPath);
      return result.channels;
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.SETTINGS,
  });
}

/**
 * Update Discord channel signal configs for a project
 *
 * @returns Mutation for updating signal channel configs
 *
 * @example
 * ```tsx
 * const mutation = useUpdateSignalChannels(currentProject?.path);
 * mutation.mutate([{ channelId: '123', channelName: 'general', enabled: true }]);
 * ```
 */
export function useUpdateSignalChannels(projectPath: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channels: DiscordChannelSignalConfig[]) => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      const result = await api.integrations.updateSignalChannels(projectPath, channels);
      return result.channels;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.integrations.signalChannels(projectPath ?? ''),
      });
    },
  });
}
