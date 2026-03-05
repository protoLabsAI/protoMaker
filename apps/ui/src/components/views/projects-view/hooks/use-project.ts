import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';

export function useProject(projectSlug: string | null) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';

  return useQuery({
    queryKey: ['project-detail', projectPath, projectSlug],
    queryFn: async () => {
      const api = getHttpApiClient();
      const res = await api.lifecycle.getProject(projectPath, projectSlug!);
      if (res.success && res.project) return res.project;
      return null;
    },
    enabled: !!projectPath && !!projectSlug,
  });
}

export function useProjectUpdate(projectSlug: string) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const api = getHttpApiClient();
      return api.lifecycle.updateProject(projectPath, projectSlug, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, projectSlug] });
    },
  });
}

export function useProjectDelete() {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectSlug: string) => {
      const api = getHttpApiClient();
      return api.lifecycle.deleteProject(projectPath, projectSlug);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects-list', projectPath] });
    },
  });
}
