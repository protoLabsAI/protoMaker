/**
 * Agent Template Mutations
 *
 * React Query mutations for creating, updating, and deleting agent templates.
 * Wraps the /api/agents/templates/* REST endpoints.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';

/**
 * Register (create) a new agent template (tier 1 — user-managed).
 *
 * @example
 * ```tsx
 * const register = useRegisterTemplate();
 * register.mutate({ name: 'my-agent', displayName: 'My Agent', ... });
 * ```
 */
export function useRegisterTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: Record<string, unknown>) => {
      const api = getElectronAPI();
      const result = await api.agentTemplates.register(template);
      if (!result.success) {
        throw new Error(result.error || 'Failed to register template');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentTemplates.all() });
      toast.success('Template registered');
    },
    onError: (error: Error) => {
      toast.error('Failed to register template', { description: error.message });
    },
  });
}

/**
 * Update an existing agent template (tier 1 only — tier 0 templates are protected).
 *
 * @example
 * ```tsx
 * const update = useUpdateTemplate();
 * update.mutate({ name: 'my-agent', updates: { displayName: 'Updated Name' } });
 * ```
 */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, updates }: { name: string; updates: Record<string, unknown> }) => {
      const api = getElectronAPI();
      const result = await api.agentTemplates.update(name, updates);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update template');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentTemplates.all() });
      toast.success('Template updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update template', { description: error.message });
    },
  });
}

/**
 * Unregister (delete) a tier-1 agent template.
 * Tier-0 (built-in) templates cannot be deleted.
 *
 * @example
 * ```tsx
 * const unregister = useUnregisterTemplate();
 * unregister.mutate('my-agent');
 * ```
 */
export function useUnregisterTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const api = getElectronAPI();
      const result = await api.agentTemplates.unregister(name);
      if (!result.success) {
        throw new Error(result.error || 'Failed to unregister template');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentTemplates.all() });
      toast.success('Template removed');
    },
    onError: (error: Error) => {
      toast.error('Failed to remove template', { description: error.message });
    },
  });
}
