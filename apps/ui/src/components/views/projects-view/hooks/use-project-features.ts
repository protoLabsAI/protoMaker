import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';

export function useProjectFeatures(projectSlug: string | null) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';

  return useQuery({
    queryKey: ['project-features', projectPath, projectSlug],
    queryFn: async () => {
      const api = getHttpApiClient();
      const res = await api.lifecycle.getProjectFeatures(projectPath, projectSlug!);
      return res as {
        success: boolean;
        data?: { features: unknown[]; epics: unknown[]; totalCount: number };
      };
    },
    enabled: !!projectPath && !!projectSlug,
  });
}
