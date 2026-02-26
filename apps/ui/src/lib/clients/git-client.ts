/**
 * Git / worktree domain mixin for the HTTP API client.
 *
 * Provides: worktree, git
 */
import type { WorktreeAPI, GitAPI } from '@/types/electron';
import type {
  DevServerStartedEvent,
  DevServerOutputEvent,
  DevServerStoppedEvent,
  DevServerLogEvent,
  DevServerLogsResponse,
} from './api-types';
import type { EventCallback } from './base-http-client';
import { BaseHttpClient, type Constructor } from './base-http-client';

export const withGitClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // Worktree API
    worktree: WorktreeAPI = {
      mergeFeature: (
        projectPath: string,
        branchName: string,
        worktreePath: string,
        targetBranch?: string,
        options?: object
      ) =>
        this.post('/api/worktree/merge', {
          projectPath,
          branchName,
          worktreePath,
          targetBranch,
          options,
        }),
      getInfo: (projectPath: string, featureId: string) =>
        this.post('/api/worktree/info', { projectPath, featureId }),
      getStatus: (projectPath: string, featureId: string) =>
        this.post('/api/worktree/status', { projectPath, featureId }),
      list: (projectPath: string) => this.post('/api/worktree/list', { projectPath }),
      listAll: (projectPath: string, includeDetails?: boolean, forceRefreshGitHub?: boolean) =>
        this.post('/api/worktree/list', { projectPath, includeDetails, forceRefreshGitHub }),
      create: (projectPath: string, branchName: string, baseBranch?: string) =>
        this.post('/api/worktree/create', {
          projectPath,
          branchName,
          baseBranch,
        }),
      delete: (projectPath: string, worktreePath: string, deleteBranch?: boolean) =>
        this.post('/api/worktree/delete', {
          projectPath,
          worktreePath,
          deleteBranch,
        }),
      commit: (worktreePath: string, message: string) =>
        this.post('/api/worktree/commit', { worktreePath, message }),
      generateCommitMessage: (worktreePath: string) =>
        this.post('/api/worktree/generate-commit-message', { worktreePath }),
      push: (worktreePath: string, force?: boolean, remote?: string) =>
        this.post('/api/worktree/push', { worktreePath, force, remote }),
      createPR: (worktreePath: string, options?: Record<string, unknown>) =>
        this.post('/api/worktree/create-pr', { worktreePath, ...options }),
      getDiffs: (projectPath: string, featureId: string) =>
        this.post('/api/worktree/diffs', { projectPath, featureId }),
      getFileDiff: (projectPath: string, featureId: string, filePath: string) =>
        this.post('/api/worktree/file-diff', {
          projectPath,
          featureId,
          filePath,
        }),
      pull: (worktreePath: string) => this.post('/api/worktree/pull', { worktreePath }),
      checkoutBranch: (worktreePath: string, branchName: string) =>
        this.post('/api/worktree/checkout-branch', { worktreePath, branchName }),
      listBranches: (worktreePath: string, includeRemote?: boolean) =>
        this.post('/api/worktree/list-branches', { worktreePath, includeRemote }),
      switchBranch: (worktreePath: string, branchName: string) =>
        this.post('/api/worktree/switch-branch', { worktreePath, branchName }),
      listRemotes: (worktreePath: string) =>
        this.post('/api/worktree/list-remotes', { worktreePath }),
      openInEditor: (worktreePath: string, editorCommand?: string) =>
        this.post('/api/worktree/open-in-editor', { worktreePath, editorCommand }),
      getDefaultEditor: () => this.get('/api/worktree/default-editor'),
      getAvailableEditors: () => this.get('/api/worktree/available-editors'),
      refreshEditors: () => this.post('/api/worktree/refresh-editors', {}),
      getAvailableTerminals: () => this.get('/api/worktree/available-terminals'),
      getDefaultTerminal: () => this.get('/api/worktree/default-terminal'),
      refreshTerminals: () => this.post('/api/worktree/refresh-terminals', {}),
      openInExternalTerminal: (worktreePath: string, terminalId?: string) =>
        this.post('/api/worktree/open-in-external-terminal', { worktreePath, terminalId }),
      initGit: (projectPath: string) => this.post('/api/worktree/init-git', { projectPath }),
      startDevServer: (projectPath: string, worktreePath: string) =>
        this.post('/api/worktree/start-dev', { projectPath, worktreePath }),
      stopDevServer: (worktreePath: string) =>
        this.post('/api/worktree/stop-dev', { worktreePath }),
      listDevServers: () => this.post('/api/worktree/list-dev-servers', {}),
      getDevServerLogs: (worktreePath: string): Promise<DevServerLogsResponse> =>
        this.get(`/api/worktree/dev-server-logs?worktreePath=${encodeURIComponent(worktreePath)}`),
      onDevServerLogEvent: (callback: (event: DevServerLogEvent) => void) => {
        const unsub1 = this.subscribeToEvent('dev-server:started', (payload) =>
          callback({ type: 'dev-server:started', payload: payload as DevServerStartedEvent })
        );
        const unsub2 = this.subscribeToEvent('dev-server:output', (payload) =>
          callback({ type: 'dev-server:output', payload: payload as DevServerOutputEvent })
        );
        const unsub3 = this.subscribeToEvent('dev-server:stopped', (payload) =>
          callback({ type: 'dev-server:stopped', payload: payload as DevServerStoppedEvent })
        );
        return () => {
          unsub1();
          unsub2();
          unsub3();
        };
      },
      getPRInfo: (worktreePath: string, branchName: string) =>
        this.post('/api/worktree/pr-info', { worktreePath, branchName }),
      // Init script methods
      getInitScript: (projectPath: string) =>
        this.get(`/api/worktree/init-script?projectPath=${encodeURIComponent(projectPath)}`),
      setInitScript: (projectPath: string, content: string) =>
        this.put('/api/worktree/init-script', { projectPath, content }),
      deleteInitScript: (projectPath: string) =>
        this.httpDelete('/api/worktree/init-script', { projectPath }),
      runInitScript: (projectPath: string, worktreePath: string, branch: string) =>
        this.post('/api/worktree/run-init-script', { projectPath, worktreePath, branch }),
      discardChanges: (worktreePath: string) =>
        this.post('/api/worktree/discard-changes', { worktreePath }),
      onInitScriptEvent: (
        callback: (event: {
          type: 'worktree:init-started' | 'worktree:init-output' | 'worktree:init-completed';
          payload: unknown;
        }) => void
      ) => {
        // Note: subscribeToEvent callback receives (payload) not (_, payload)
        const unsub1 = this.subscribeToEvent('worktree:init-started', (payload) =>
          callback({ type: 'worktree:init-started', payload })
        );
        const unsub2 = this.subscribeToEvent('worktree:init-output', (payload) =>
          callback({ type: 'worktree:init-output', payload })
        );
        const unsub3 = this.subscribeToEvent('worktree:init-completed', (payload) =>
          callback({ type: 'worktree:init-completed', payload })
        );
        return () => {
          unsub1();
          unsub2();
          unsub3();
        };
      },
    };

    // Git API
    git: GitAPI = {
      getDiffs: (projectPath: string) => this.post('/api/git/diffs', { projectPath }),
      getFileDiff: (projectPath: string, filePath: string) =>
        this.post('/api/git/file-diff', { projectPath, filePath }),
    };
  };
