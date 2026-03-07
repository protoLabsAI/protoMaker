/**
 * Todo Mutations
 *
 * React Query mutations for creating, updating, and deleting todo lists and items.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import type { TodoList, TodoItem } from '@protolabsai/types';

function invalidateTodoLists(queryClient: ReturnType<typeof useQueryClient>, projectPath: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.todoLists.all(projectPath) });
}

/** Create a new todo list */
export function useCreateTodoList(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<TodoList> => {
      const client = getHttpApiClient();
      const result = await client.todos.createList(projectPath, name);
      if (!result?.success) throw new Error('Failed to create todo list');
      return result.list;
    },
    onSuccess: () => {
      invalidateTodoLists(queryClient, projectPath);
    },
    onError: (error: Error) => {
      toast.error('Failed to create list', { description: error.message });
    },
  });
}

/** Delete a todo list */
export function useDeleteTodoList(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listId: string): Promise<void> => {
      const client = getHttpApiClient();
      const result = await client.todos.deleteList(projectPath, listId);
      if (!result?.success) throw new Error('Failed to delete todo list');
    },
    onSuccess: () => {
      invalidateTodoLists(queryClient, projectPath);
    },
    onError: (error: Error) => {
      toast.error('Failed to delete list', { description: error.message });
    },
  });
}

/** Add an item to a todo list */
export function useAddTodoItem(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listId,
      title,
      priority,
    }: {
      listId: string;
      title: string;
      priority?: 0 | 1 | 2 | 3 | 4;
    }): Promise<TodoItem> => {
      const client = getHttpApiClient();
      const result = await client.todos.addItem(projectPath, listId, title, priority);
      if (!result?.success) throw new Error('Failed to add item');
      return result.item;
    },
    onSuccess: () => {
      invalidateTodoLists(queryClient, projectPath);
    },
    onError: (error: Error) => {
      toast.error('Failed to add item', { description: error.message });
    },
  });
}

/** Update a todo item */
export function useUpdateTodoItem(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listId,
      itemId,
      updates,
    }: {
      listId: string;
      itemId: string;
      updates: Partial<
        Pick<TodoItem, 'title' | 'completed' | 'completedAt' | 'dueDate' | 'priority'>
      >;
    }): Promise<TodoItem> => {
      const client = getHttpApiClient();
      const result = await client.todos.updateItem(projectPath, listId, itemId, updates);
      if (!result?.success) throw new Error('Failed to update item');
      return result.item;
    },
    onSuccess: () => {
      invalidateTodoLists(queryClient, projectPath);
    },
    onError: (error: Error) => {
      toast.error('Failed to update item', { description: error.message });
    },
  });
}

/** Complete a todo item */
export function useCompleteTodoItem(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listId,
      itemId,
    }: {
      listId: string;
      itemId: string;
    }): Promise<TodoItem> => {
      const client = getHttpApiClient();
      const result = await client.todos.completeItem(projectPath, listId, itemId);
      if (!result?.success) throw new Error('Failed to complete item');
      return result.item;
    },
    onSuccess: () => {
      invalidateTodoLists(queryClient, projectPath);
    },
    onError: (error: Error) => {
      toast.error('Failed to complete item', { description: error.message });
    },
  });
}

/** Delete a todo item */
export function useDeleteTodoItem(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listId, itemId }: { listId: string; itemId: string }): Promise<void> => {
      const client = getHttpApiClient();
      const result = await client.todos.deleteItem(projectPath, listId, itemId);
      if (!result?.success) throw new Error('Failed to delete item');
    },
    onSuccess: () => {
      invalidateTodoLists(queryClient, projectPath);
    },
    onError: (error: Error) => {
      toast.error('Failed to delete item', { description: error.message });
    },
  });
}
