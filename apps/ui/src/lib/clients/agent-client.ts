/**
 * Agent domain mixin for the HTTP API client.
 *
 * Provides: runningAgents, github, workspace, agent, templates, agentTemplates
 */
import type { GitHubAPI, IssueValidationInput, IssueValidationEvent } from '../electron';
import type { Message } from '@/types/electron';
import type { ModelId, ThinkingLevel, ReasoningEffort } from '@protolabs-ai/types';
import type { EventCallback } from './base-http-client';
import { BaseHttpClient, type Constructor } from './base-http-client';

export const withAgentClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // Running Agents API
    runningAgents = {
      getAll: (): Promise<{
        success: boolean;
        runningAgents?: Array<{
          featureId: string;
          projectPath: string;
          projectName: string;
          isAutoMode: boolean;
          startTime: number;
          model?: string;
          provider?: string;
          title?: string;
          description?: string;
          branchName?: string;
        }>;
        totalCount?: number;
        error?: string;
      }> => this.get('/api/running-agents'),
    };

    // GitHub API
    github: GitHubAPI = {
      checkRemote: (projectPath: string) => this.post('/api/github/check-remote', { projectPath }),
      listIssues: (projectPath: string) => this.post('/api/github/issues', { projectPath }),
      listPRs: (projectPath: string) => this.post('/api/github/prs', { projectPath }),
      validateIssue: (
        projectPath: string,
        issue: IssueValidationInput,
        model?: ModelId,
        thinkingLevel?: ThinkingLevel,
        reasoningEffort?: ReasoningEffort
      ) =>
        this.post('/api/github/validate-issue', {
          projectPath,
          ...issue,
          model,
          thinkingLevel,
          reasoningEffort,
        }),
      getValidationStatus: (projectPath: string, issueNumber?: number) =>
        this.post('/api/github/validation-status', { projectPath, issueNumber }),
      stopValidation: (projectPath: string, issueNumber: number) =>
        this.post('/api/github/validation-stop', { projectPath, issueNumber }),
      getValidations: (projectPath: string, issueNumber?: number) =>
        this.post('/api/github/validations', { projectPath, issueNumber }),
      markValidationViewed: (projectPath: string, issueNumber: number) =>
        this.post('/api/github/validation-mark-viewed', { projectPath, issueNumber }),
      onValidationEvent: (callback: (event: IssueValidationEvent) => void) =>
        this.subscribeToEvent('issue-validation:event', callback as EventCallback),
      getIssueComments: (projectPath: string, issueNumber: number, cursor?: string) =>
        this.post('/api/github/issue-comments', { projectPath, issueNumber, cursor }),
    };

    // Workspace API
    workspace = {
      getConfig: (): Promise<{
        success: boolean;
        configured: boolean;
        workspaceDir?: string;
        defaultDir?: string | null;
        error?: string;
      }> => this.get('/api/workspace/config'),

      getDirectories: (): Promise<{
        success: boolean;
        directories?: Array<{ name: string; path: string }>;
        error?: string;
      }> => this.get('/api/workspace/directories'),
    };

    // Agent API
    agent = {
      start: (
        sessionId: string,
        workingDirectory?: string
      ): Promise<{
        success: boolean;
        messages?: Message[];
        error?: string;
      }> => this.post('/api/agent/start', { sessionId, workingDirectory }),

      send: (
        sessionId: string,
        message: string,
        workingDirectory?: string,
        imagePaths?: string[],
        model?: string,
        thinkingLevel?: string,
        role?: string,
        maxTurns?: number,
        systemPromptOverride?: string
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/agent/send', {
          sessionId,
          message,
          workingDirectory,
          imagePaths,
          model,
          thinkingLevel,
          role,
          maxTurns,
          systemPromptOverride,
        }),

      getHistory: (
        sessionId: string
      ): Promise<{
        success: boolean;
        messages?: Message[];
        isRunning?: boolean;
        error?: string;
      }> => this.post('/api/agent/history', { sessionId }),

      stop: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/agent/stop', { sessionId }),

      clear: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/agent/clear', { sessionId }),

      onStream: (callback: (data: unknown) => void): (() => void) => {
        return this.subscribeToEvent('agent:stream', callback as EventCallback);
      },

      // Queue management
      queueAdd: (
        sessionId: string,
        message: string,
        imagePaths?: string[],
        model?: string,
        thinkingLevel?: string,
        role?: string,
        maxTurns?: number,
        systemPromptOverride?: string
      ): Promise<{
        success: boolean;
        queuedPrompt?: {
          id: string;
          message: string;
          imagePaths?: string[];
          model?: string;
          thinkingLevel?: string;
          addedAt: string;
        };
        error?: string;
      }> =>
        this.post('/api/agent/queue/add', {
          sessionId,
          message,
          imagePaths,
          model,
          thinkingLevel,
          role,
          maxTurns,
          systemPromptOverride,
        }),

      queueList: (
        sessionId: string
      ): Promise<{
        success: boolean;
        queue?: Array<{
          id: string;
          message: string;
          imagePaths?: string[];
          model?: string;
          thinkingLevel?: string;
          addedAt: string;
        }>;
        error?: string;
      }> => this.post('/api/agent/queue/list', { sessionId }),

      queueRemove: (
        sessionId: string,
        promptId: string
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/agent/queue/remove', { sessionId, promptId }),

      queueClear: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/agent/queue/clear', { sessionId }),
    };

    // Templates API
    templates = {
      clone: (
        repoUrl: string,
        projectName: string,
        parentDir: string
      ): Promise<{
        success: boolean;
        projectPath?: string;
        projectName?: string;
        error?: string;
      }> => this.post('/api/templates/clone', { repoUrl, projectName, parentDir }),
    };

    // Agent Templates API
    agentTemplates = {
      list: (
        role?: string
      ): Promise<{
        success: boolean;
        templates: Array<{
          name: string;
          displayName: string;
          description: string;
          role: string;
          tier: number;
          model?: string;
          tags?: string[];
        }>;
        count: number;
        error?: string;
      }> => this.post('/api/agents/templates/list', { role }),
    };
  };
