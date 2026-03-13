import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';

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
      queryClient.invalidateQueries({ queryKey: ['projects-list', projectPath] });
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

export function useApprovePrd(projectSlug: string) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.approvePrd(projectPath, projectSlug, {
        createEpics: true,
        setupDependencies: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, projectSlug] });
    },
  });
}

export function useRequestChanges(projectSlug: string) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedback: string) => {
      const api = getHttpApiClient();
      return api.lifecycle.requestChanges(projectPath, projectSlug, feedback);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, projectSlug] });
    },
  });
}

export function useLaunchProject(projectSlug: string) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (maxConcurrency?: number) => {
      const api = getHttpApiClient();
      return api.lifecycle.launch(projectPath, projectSlug, maxConcurrency);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, projectSlug] });
    },
  });
}

export function useResearchTrigger(projectSlug: string) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.triggerResearch(projectPath, projectSlug);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, projectSlug] });
    },
  });

  return {
    trigger: mutation.mutate,
    isPending: mutation.isPending,
  };
}

export function useCreateProject() {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      goal: string;
      description?: string;
      color?: string;
      priority?: string;
      researchOnCreate: boolean;
    }) => {
      const api = getHttpApiClient();
      // Use description as ideaDescription; fall back to goal if not provided
      const ideaDescription = data.description?.trim() || data.goal.trim();
      return api.lifecycle.initiate(projectPath, data.title, ideaDescription);
    },
    onSuccess: (result, variables) => {
      toast.success('Project created', {
        description: `Created "${variables.title}"`,
      });
      if (variables.researchOnCreate) {
        toast.info('Research started — findings will appear in the Research tab');
      }
      queryClient.invalidateQueries({ queryKey: ['projects-list', projectPath] });
      if (result.localSlug) {
        void navigate({ to: '/projects/$slug', params: { slug: result.localSlug } });
      }
    },
    onError: (error: Error) => {
      toast.error(
        `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });
}
