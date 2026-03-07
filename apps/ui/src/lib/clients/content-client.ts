/**
 * Content-oriented client mixin: notes, AI editor, content/authority pipelines.
 *
 * Extracted from the monolithic http-api-client.ts — contains:
 *   - notes              (workspace CRUD, tab management)
 *   - ai                 (streaming ghost-text, rewrite, generate — raw fetch)
 *   - contentPipeline    (route text to content agents)
 *   - authorityPipeline  (route ideas to PM agent)
 */
import type { NotesWorkspace, NoteTabPermissions, TodoList, TodoItem } from '@protolabsai/types';
import { BaseHttpClient, type Constructor } from './base-http-client';

export const withContentClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // Notes API
    notes = {
      getWorkspace: (projectPath: string): Promise<{ workspace: NotesWorkspace }> =>
        this.post('/api/notes/get', { projectPath }),

      saveWorkspace: (
        projectPath: string,
        workspace: NotesWorkspace
      ): Promise<{ success: boolean }> => this.post('/api/notes/save', { projectPath, workspace }),

      createTab: (
        projectPath: string,
        name?: string,
        content?: string
      ): Promise<{ success: boolean; tab: Record<string, unknown>; workspaceVersion: number }> =>
        this.post('/api/notes/create-tab', { projectPath, name, content }),

      deleteTab: (
        projectPath: string,
        tabId: string
      ): Promise<{ success: boolean; deletedTabId: string; workspaceVersion: number }> =>
        this.post('/api/notes/delete-tab', { projectPath, tabId }),

      renameTab: (
        projectPath: string,
        tabId: string,
        name: string
      ): Promise<{ success: boolean; tab: Record<string, unknown>; workspaceVersion: number }> =>
        this.post('/api/notes/rename-tab', { projectPath, tabId, name }),

      updateTabPermissions: (
        projectPath: string,
        tabId: string,
        permissions: Partial<NoteTabPermissions>
      ): Promise<{ success: boolean; tab: Record<string, unknown>; workspaceVersion: number }> =>
        this.post('/api/notes/update-tab-permissions', { projectPath, tabId, permissions }),

      reorderTabs: (
        projectPath: string,
        tabOrder: string[]
      ): Promise<{ success: boolean; tabOrder: string[]; workspaceVersion: number }> =>
        this.post('/api/notes/reorder-tabs', { projectPath, tabOrder }),
    };

    // AI Editor API (streaming endpoints for notes panel AI features)
    ai = {
      /** Ghost text autocomplete — returns a ReadableStream of predicted text */
      complete: (
        context: string,
        currentLine: string,
        projectContext?: string | null
      ): Promise<Response> =>
        fetch(`${this.serverUrl}/api/ai/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            context,
            currentLine,
            projectContext: projectContext || undefined,
          }),
        }),

      /** Rewrite selected text — returns a ReadableStream of replacement HTML */
      rewrite: (
        text: string,
        instruction: string,
        surroundingContext?: string
      ): Promise<Response> =>
        fetch(`${this.serverUrl}/api/ai/rewrite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ text, instruction, surroundingContext }),
        }),

      /** Generate content from slash command — returns a ReadableStream of HTML */
      generate: (command: string, context: string, selection?: string): Promise<Response> =>
        fetch(`${this.serverUrl}/api/ai/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ command, context, selection }),
        }),
    };

    // Content Pipeline API — route text to Jon/Cindi for content creation
    contentPipeline = {
      create: (
        projectPath: string,
        topic: string,
        contentConfig?: { format?: string; tone?: string; audience?: string }
      ): Promise<{ success: boolean; runId?: string; error?: string }> =>
        this.post('/api/content/create', { projectPath, topic, contentConfig }),
    };

    // Authority Pipeline API — route ideas to the PM agent
    authorityPipeline = {
      injectIdea: (
        projectPath: string,
        title: string,
        description: string
      ): Promise<{ success: boolean; feature?: unknown; message?: string; error?: string }> =>
        this.post('/api/authority/inject-idea', { projectPath, title, description }),
    };

    // Todo API — per-project todo lists and items
    todos = {
      list: (projectPath: string): Promise<{ success: boolean; lists: TodoList[] }> =>
        this.post('/api/todos/list', { projectPath }),

      createList: (
        projectPath: string,
        name: string
      ): Promise<{ success: boolean; list: TodoList }> =>
        this.post('/api/todos/create-list', { projectPath, name }),

      deleteList: (projectPath: string, listId: string): Promise<{ success: boolean }> =>
        this.post('/api/todos/delete-list', { projectPath, listId }),

      addItem: (
        projectPath: string,
        listId: string,
        title: string,
        priority?: 0 | 1 | 2 | 3 | 4,
        dueDate?: string,
        linkedFeatureId?: string
      ): Promise<{ success: boolean; item: TodoItem }> =>
        this.post('/api/todos/add-item', {
          projectPath,
          listId,
          title,
          priority,
          dueDate,
          linkedFeatureId,
        }),

      updateItem: (
        projectPath: string,
        listId: string,
        itemId: string,
        updates: Partial<
          Pick<TodoItem, 'title' | 'completed' | 'completedAt' | 'dueDate' | 'priority'>
        >
      ): Promise<{ success: boolean; item: TodoItem }> =>
        this.post('/api/todos/update-item', { projectPath, listId, itemId, updates }),

      completeItem: (
        projectPath: string,
        listId: string,
        itemId: string
      ): Promise<{ success: boolean; item: TodoItem }> =>
        this.post('/api/todos/complete-item', { projectPath, listId, itemId }),

      deleteItem: (
        projectPath: string,
        listId: string,
        itemId: string
      ): Promise<{ success: boolean }> =>
        this.post('/api/todos/delete-item', { projectPath, listId, itemId }),
    };
  };
