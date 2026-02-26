/**
 * Settings, sessions, claude/codex usage, and context client mixin.
 *
 * Extracted from the monolithic http-api-client.ts — contains:
 *   - settings   (global, project, credentials, workflow, user identity, agent discovery)
 *   - sessions   (list, create, update, archive, delete)
 *   - claude     (usage)
 *   - codex      (usage, models)
 *   - context    (image/file description)
 */
import type { SessionListItem } from '@/types/electron';
import type { GlobalSettings, ProjectSettings } from '@protolabs-ai/types';
import type { ClaudeUsageResponse, CodexUsageResponse } from '@/store/types';
import { BaseHttpClient, type Constructor } from './base-http-client';

export const withSettingsClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // Settings API - persistent file-based settings
    settings = {
      // Get settings status (check if migration needed)
      getStatus: (): Promise<{
        success: boolean;
        hasGlobalSettings: boolean;
        hasCredentials: boolean;
        dataDir: string;
        needsMigration: boolean;
      }> => this.get('/api/settings/status'),

      // Global settings
      getGlobal: (): Promise<{
        success: boolean;
        settings?: GlobalSettings;
        error?: string;
      }> => this.get('/api/settings/global'),

      updateGlobal: (
        updates: Record<string, unknown>
      ): Promise<{
        success: boolean;
        settings?: GlobalSettings;
        error?: string;
      }> => this.put('/api/settings/global', updates),

      // Credentials (masked for security)
      getCredentials: (): Promise<{
        success: boolean;
        credentials?: {
          anthropic: { configured: boolean; masked: string };
          google: { configured: boolean; masked: string };
          openai: { configured: boolean; masked: string };
        };
        error?: string;
      }> => this.get('/api/settings/credentials'),

      updateCredentials: (updates: {
        apiKeys?: { anthropic?: string; google?: string; openai?: string };
      }): Promise<{
        success: boolean;
        credentials?: {
          anthropic: { configured: boolean; masked: string };
          google: { configured: boolean; masked: string };
          openai: { configured: boolean; masked: string };
        };
        error?: string;
      }> => this.put('/api/settings/credentials', updates),

      // Project settings
      getProject: (
        projectPath: string
      ): Promise<{
        success: boolean;
        settings?: ProjectSettings;
        error?: string;
      }> => this.post('/api/settings/project', { projectPath }),

      updateProject: (
        projectPath: string,
        updates: Record<string, unknown>
      ): Promise<{
        success: boolean;
        settings?: ProjectSettings;
        error?: string;
      }> => this.put('/api/settings/project', { projectPath, updates }),

      // Migration from localStorage
      migrate: (data: {
        'automaker-storage'?: string;
        'automaker-setup'?: string;
        'worktree-panel-collapsed'?: string;
        'file-browser-recent-folders'?: string;
        'automaker:lastProjectDir'?: string;
      }): Promise<{
        success: boolean;
        migratedGlobalSettings: boolean;
        migratedCredentials: boolean;
        migratedProjectCount: number;
        errors: string[];
      }> => this.post('/api/settings/migrate', { data }),

      // Workflow settings (per-project pipeline hardening)
      getWorkflow: (
        projectPath: string
      ): Promise<{
        success: boolean;
        workflow?: Record<string, unknown>;
        error?: string;
      }> => this.post('/api/settings/workflow', { projectPath }),

      updateWorkflow: (
        projectPath: string,
        workflow: Record<string, unknown>
      ): Promise<{
        success: boolean;
        workflow?: Record<string, unknown>;
        error?: string;
      }> => this.put('/api/settings/workflow', { projectPath, workflow }),

      // User identity (name for board assignment)
      getUserIdentity: (): Promise<{
        success: boolean;
        identity?: string;
        error?: string;
      }> => this.get('/api/user/identity'),

      setUserIdentity: (
        identity: string
      ): Promise<{
        success: boolean;
        identity?: string;
        error?: string;
      }> => this.post('/api/user/identity', { identity }),

      // Filesystem agents discovery (read-only)
      discoverAgents: (
        projectPath?: string,
        sources?: Array<'user' | 'project'>
      ): Promise<{
        success: boolean;
        agents?: Array<{
          name: string;
          definition: {
            description: string;
            prompt: string;
            tools?: string[];
            model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
          };
          source: 'user' | 'project';
          filePath: string;
        }>;
        error?: string;
      }> => this.post('/api/settings/agents/discover', { projectPath, sources }),
    };

    // Sessions API
    sessions = {
      list: (
        includeArchived?: boolean
      ): Promise<{
        success: boolean;
        sessions?: SessionListItem[];
        error?: string;
      }> => this.get(`/api/sessions?includeArchived=${includeArchived || false}`),

      create: (
        name: string,
        projectPath: string,
        workingDirectory?: string
      ): Promise<{
        success: boolean;
        session?: {
          id: string;
          name: string;
          projectPath: string;
          workingDirectory?: string;
          createdAt: string;
          updatedAt: string;
        };
        error?: string;
      }> => this.post('/api/sessions', { name, projectPath, workingDirectory }),

      update: (
        sessionId: string,
        name?: string,
        tags?: string[]
      ): Promise<{ success: boolean; error?: string }> =>
        this.put(`/api/sessions/${sessionId}`, { name, tags }),

      archive: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
        this.post(`/api/sessions/${sessionId}/archive`, {}),

      unarchive: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
        this.post(`/api/sessions/${sessionId}/unarchive`, {}),

      delete: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
        this.httpDelete(`/api/sessions/${sessionId}`),
    };

    // Claude API
    claude = {
      getUsage: (): Promise<ClaudeUsageResponse> => this.get('/api/claude/usage'),
    };

    // Codex API
    codex = {
      getUsage: (): Promise<CodexUsageResponse> => this.get('/api/codex/usage'),
      getModels: (
        refresh = false
      ): Promise<{
        success: boolean;
        models?: Array<{
          id: string;
          label: string;
          description: string;
          hasThinking: boolean;
          supportsVision: boolean;
          tier: 'premium' | 'standard' | 'basic';
          isDefault: boolean;
        }>;
        cachedAt?: number;
        error?: string;
      }> => {
        const url = `/api/codex/models${refresh ? '?refresh=true' : ''}`;
        return this.get(url);
      },
    };

    // Context API
    context = {
      describeImage: (
        imagePath: string
      ): Promise<{
        success: boolean;
        description?: string;
        error?: string;
      }> => this.post('/api/context/describe-image', { imagePath }),

      describeFile: (
        filePath: string
      ): Promise<{
        success: boolean;
        description?: string;
        error?: string;
      }> => this.post('/api/context/describe-file', { filePath }),
    };
  };
