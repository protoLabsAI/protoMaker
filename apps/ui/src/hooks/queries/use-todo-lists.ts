/**
 * Todo Lists Query Hook
 *
 * Fetches all todo lists for a project.
 */

import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import type { TodoList } from '@protolabsai/types';

/**
 * Fetch all todo lists for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with todo lists array
 */
export function useTodoLists(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.todoLists.all(projectPath ?? ''),
    queryFn: async (): Promise<TodoList[]> => {
      if (!projectPath) throw new Error('No project path');
      const client = getHttpApiClient();
      const result = await client.todos.list(projectPath);
      if (!result?.success) {
        throw new Error('Failed to fetch todo lists');
      }
      return result.lists ?? [];
    },
    enabled: !!projectPath,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
