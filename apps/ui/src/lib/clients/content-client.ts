/**
 * Content-oriented client mixin: notes, AI editor, content/authority pipelines, voice.
 *
 * Extracted from the monolithic http-api-client.ts — contains:
 *   - notes              (workspace CRUD, tab management)
 *   - ai                 (streaming ghost-text, rewrite, generate — raw fetch)
 *   - contentPipeline    (route text to content agents)
 *   - authorityPipeline  (route ideas to PM agent)
 *   - voice              (transcribe via postBinary)
 */
import type { NotesWorkspace, NoteTabPermissions } from '@protolabs-ai/types';
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

    // Voice API
    voice = {
      transcribe: (pcmBuffer: ArrayBuffer) =>
        this.postBinary<{ text: string; isWakeWord: boolean; command?: string }>(
          '/api/voice/transcribe',
          pcmBuffer
        ),
      getModels: () =>
        this.get<{
          models: Array<{
            size: string;
            downloaded: boolean;
            bytes: number;
            expectedBytes: number;
          }>;
        }>('/api/voice/models'),
      downloadModel: (size: string) =>
        this.post<{ success: boolean; path: string }>('/api/voice/models/download', { size }),
    };
  };
