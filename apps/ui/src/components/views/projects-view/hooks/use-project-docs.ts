import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';

export function useProjectDocs(projectSlug: string | null) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();

  const docsQuery = useQuery({
    queryKey: ['project-docs', projectPath, projectSlug],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.listDocs(projectPath, projectSlug!);
    },
    enabled: !!projectPath && !!projectSlug,
  });

  const createDoc = useMutation({
    mutationFn: async ({ title, content }: { title: string; content?: string }) => {
      const api = getHttpApiClient();
      return api.lifecycle.createDoc(projectPath, projectSlug!, title, content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-docs', projectPath, projectSlug] });
    },
  });

  const updateDoc = useMutation({
    mutationFn: async ({
      docId,
      title,
      content,
    }: {
      docId: string;
      title?: string;
      content?: string;
    }) => {
      const api = getHttpApiClient();
      return api.lifecycle.updateDoc(projectPath, projectSlug!, docId, title, content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-docs', projectPath, projectSlug] });
    },
  });

  const deleteDoc = useMutation({
    mutationFn: async (docId: string) => {
      const api = getHttpApiClient();
      return api.lifecycle.deleteDoc(projectPath, projectSlug!, docId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-docs', projectPath, projectSlug] });
    },
  });

  return { docsQuery, createDoc, updateDoc, deleteDoc };
}
