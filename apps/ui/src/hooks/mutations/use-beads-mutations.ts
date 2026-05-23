/**
 * Beads Mutations
 *
 * React Query mutations for the `br` (beads_rust) issue tracker.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import type { BeadsIssue, CreateBeadsIssueInput, UpdateBeadsIssueInput } from '@protolabsai/types';

function invalidateBeads(queryClient: ReturnType<typeof useQueryClient>, projectPath: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.beads.list(projectPath) });
  queryClient.invalidateQueries({ queryKey: queryKeys.beads.ready(projectPath) });
}

export function useCreateBeadsIssue(projectPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBeadsIssueInput): Promise<BeadsIssue> => {
      const client = getHttpApiClient();
      const result = await client.beads.create(projectPath, input);
      if (!result?.success) throw new Error('Failed to create issue');
      return result.issue;
    },
    onSuccess: () => invalidateBeads(queryClient, projectPath),
    onError: (error: Error) => {
      toast.error('Failed to create issue', { description: error.message });
    },
  });
}

export function useUpdateBeadsIssue(projectPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UpdateBeadsIssueInput;
    }): Promise<BeadsIssue> => {
      const client = getHttpApiClient();
      const result = await client.beads.update(projectPath, id, input);
      if (!result?.success) throw new Error('Failed to update issue');
      return result.issue;
    },
    onSuccess: () => invalidateBeads(queryClient, projectPath),
    onError: (error: Error) => {
      toast.error('Failed to update issue', { description: error.message });
    },
  });
}

export function useCloseBeadsIssue(projectPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }): Promise<BeadsIssue> => {
      const client = getHttpApiClient();
      const result = await client.beads.close(projectPath, id, reason);
      if (!result?.success) throw new Error('Failed to close issue');
      return result.issue;
    },
    onSuccess: () => invalidateBeads(queryClient, projectPath),
    onError: (error: Error) => {
      toast.error('Failed to close issue', { description: error.message });
    },
  });
}

export function useDeleteBeadsIssue(projectPath: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string[]> => {
      const client = getHttpApiClient();
      const result = await client.beads.delete(projectPath, id);
      if (!result?.success) throw new Error('Failed to delete issue');
      return result.deleted;
    },
    onSuccess: () => invalidateBeads(queryClient, projectPath),
    onError: (error: Error) => {
      toast.error('Failed to delete issue', { description: error.message });
    },
  });
}
