/**
 * Setup, model, and setup-lab client mixin.
 *
 * Extracted from the monolithic http-api-client.ts — contains:
 *   - checkClaudeCli()  (standalone async method)
 *   - model             (model availability & provider checks)
 *   - setup             (CLI installs, auth, permissions, etc.)
 *   - setupLab          (repo research, gap analysis, proposals)
 */
import type { ModelDefinition, ProviderStatus } from '@/types/electron';
import type { RepoResearchResult, GapAnalysisReport, AlignmentProposal } from '@protolabs-ai/types';
import { BaseHttpClient, type Constructor } from './base-http-client';

export const withSetupClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    async checkClaudeCli(): Promise<{
      success: boolean;
      status?: string;
      method?: string;
      version?: string;
      path?: string;
      recommendation?: string;
      installCommands?: {
        macos?: string;
        windows?: string;
        linux?: string;
        npm?: string;
      };
      error?: string;
    }> {
      return this.get('/api/setup/claude-status');
    }

    // Model API
    model = {
      getAvailable: async (): Promise<{
        success: boolean;
        models?: ModelDefinition[];
        error?: string;
      }> => {
        return this.get('/api/models/available');
      },
      checkProviders: async (): Promise<{
        success: boolean;
        providers?: Record<string, ProviderStatus>;
        error?: string;
      }> => {
        return this.get('/api/models/providers');
      },
    };

    // Setup API
    setup = {
      getClaudeStatus: (): Promise<{
        success: boolean;
        status?: string;
        installed?: boolean;
        method?: string;
        version?: string;
        path?: string;
        auth?: {
          authenticated: boolean;
          method: string;
          hasCredentialsFile?: boolean;
          hasToken?: boolean;
          hasStoredOAuthToken?: boolean;
          hasStoredApiKey?: boolean;
          hasEnvApiKey?: boolean;
          hasEnvOAuthToken?: boolean;
          hasCliAuth?: boolean;
          hasRecentActivity?: boolean;
        };
        error?: string;
      }> => this.get('/api/setup/claude-status'),

      installClaude: (): Promise<{
        success: boolean;
        message?: string;
        error?: string;
      }> => this.post('/api/setup/install-claude'),

      authClaude: (): Promise<{
        success: boolean;
        token?: string;
        requiresManualAuth?: boolean;
        terminalOpened?: boolean;
        command?: string;
        error?: string;
        message?: string;
        output?: string;
      }> => this.post('/api/setup/auth-claude'),

      deauthClaude: (): Promise<{
        success: boolean;
        requiresManualDeauth?: boolean;
        command?: string;
        message?: string;
        error?: string;
      }> => this.post('/api/setup/deauth-claude'),

      storeApiKey: (
        provider: string,
        apiKey: string
      ): Promise<{
        success: boolean;
        error?: string;
      }> => this.post('/api/setup/store-api-key', { provider, apiKey }),

      deleteApiKey: (
        provider: string
      ): Promise<{
        success: boolean;
        error?: string;
        message?: string;
      }> => this.post('/api/setup/delete-api-key', { provider }),

      getApiKeys: (): Promise<{
        success: boolean;
        hasAnthropicKey: boolean;
        hasGoogleKey: boolean;
        hasOpenaiKey: boolean;
      }> => this.get('/api/setup/api-keys'),

      getPlatform: (): Promise<{
        success: boolean;
        platform: string;
        arch: string;
        homeDir: string;
        isWindows: boolean;
        isMac: boolean;
        isLinux: boolean;
      }> => this.get('/api/setup/platform'),

      verifyClaudeAuth: (
        authMethod?: 'cli' | 'api_key',
        apiKey?: string
      ): Promise<{
        success: boolean;
        authenticated: boolean;
        error?: string;
      }> => this.post('/api/setup/verify-claude-auth', { authMethod, apiKey }),

      getGhStatus: (): Promise<{
        success: boolean;
        installed: boolean;
        authenticated: boolean;
        version: string | null;
        path: string | null;
        user: string | null;
        error?: string;
      }> => this.get('/api/setup/gh-status'),

      // Cursor CLI methods
      getCursorStatus: (): Promise<{
        success: boolean;
        installed?: boolean;
        version?: string | null;
        path?: string | null;
        auth?: {
          authenticated: boolean;
          method: string;
        };
        installCommand?: string;
        loginCommand?: string;
        error?: string;
      }> => this.get('/api/setup/cursor-status'),

      authCursor: (): Promise<{
        success: boolean;
        token?: string;
        requiresManualAuth?: boolean;
        terminalOpened?: boolean;
        command?: string;
        message?: string;
        output?: string;
      }> => this.post('/api/setup/auth-cursor'),

      deauthCursor: (): Promise<{
        success: boolean;
        requiresManualDeauth?: boolean;
        command?: string;
        message?: string;
        error?: string;
      }> => this.post('/api/setup/deauth-cursor'),

      authOpencode: (): Promise<{
        success: boolean;
        token?: string;
        requiresManualAuth?: boolean;
        terminalOpened?: boolean;
        command?: string;
        message?: string;
        output?: string;
      }> => this.post('/api/setup/auth-opencode'),

      deauthOpencode: (): Promise<{
        success: boolean;
        requiresManualDeauth?: boolean;
        command?: string;
        message?: string;
        error?: string;
      }> => this.post('/api/setup/deauth-opencode'),

      getCursorConfig: (
        projectPath: string
      ): Promise<{
        success: boolean;
        config?: {
          defaultModel?: string;
          models?: string[];
          mcpServers?: string[];
          rules?: string[];
        };
        availableModels?: Array<{
          id: string;
          label: string;
          description: string;
          hasThinking: boolean;
          tier: 'free' | 'pro';
        }>;
        error?: string;
      }> => this.get(`/api/setup/cursor-config?projectPath=${encodeURIComponent(projectPath)}`),

      setCursorDefaultModel: (
        projectPath: string,
        model: string
      ): Promise<{
        success: boolean;
        model?: string;
        error?: string;
      }> => this.post('/api/setup/cursor-config/default-model', { projectPath, model }),

      setCursorModels: (
        projectPath: string,
        models: string[]
      ): Promise<{
        success: boolean;
        models?: string[];
        error?: string;
      }> => this.post('/api/setup/cursor-config/models', { projectPath, models }),

      // Cursor CLI Permissions
      getCursorPermissions: (
        projectPath?: string
      ): Promise<{
        success: boolean;
        globalPermissions?: { allow: string[]; deny: string[] } | null;
        projectPermissions?: { allow: string[]; deny: string[] } | null;
        effectivePermissions?: { allow: string[]; deny: string[] } | null;
        activeProfile?: 'strict' | 'development' | 'custom' | null;
        hasProjectConfig?: boolean;
        availableProfiles?: Array<{
          id: string;
          name: string;
          description: string;
          permissions: { allow: string[]; deny: string[] };
        }>;
        error?: string;
      }> =>
        this.get(
          `/api/setup/cursor-permissions${projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : ''}`
        ),

      applyCursorPermissionProfile: (
        profileId: 'strict' | 'development',
        scope: 'global' | 'project',
        projectPath?: string
      ): Promise<{
        success: boolean;
        message?: string;
        scope?: string;
        profileId?: string;
        error?: string;
      }> => this.post('/api/setup/cursor-permissions/profile', { profileId, scope, projectPath }),

      setCursorCustomPermissions: (
        projectPath: string,
        permissions: { allow: string[]; deny: string[] }
      ): Promise<{
        success: boolean;
        message?: string;
        permissions?: { allow: string[]; deny: string[] };
        error?: string;
      }> => this.post('/api/setup/cursor-permissions/custom', { projectPath, permissions }),

      deleteCursorProjectPermissions: (
        projectPath: string
      ): Promise<{
        success: boolean;
        message?: string;
        error?: string;
      }> =>
        this.httpDelete(
          `/api/setup/cursor-permissions?projectPath=${encodeURIComponent(projectPath)}`
        ),

      getCursorExampleConfig: (
        profileId?: 'strict' | 'development'
      ): Promise<{
        success: boolean;
        profileId?: string;
        config?: string;
        error?: string;
      }> =>
        this.get(
          `/api/setup/cursor-permissions/example${profileId ? `?profileId=${profileId}` : ''}`
        ),

      // Codex CLI methods
      getCodexStatus: (): Promise<{
        success: boolean;
        status?: string;
        installed?: boolean;
        method?: string;
        version?: string;
        path?: string;
        auth?: {
          authenticated: boolean;
          method: string;
          hasAuthFile?: boolean;
          hasOAuthToken?: boolean;
          hasApiKey?: boolean;
          hasStoredApiKey?: boolean;
          hasEnvApiKey?: boolean;
        };
        error?: string;
      }> => this.get('/api/setup/codex-status'),

      installCodex: (): Promise<{
        success: boolean;
        message?: string;
        error?: string;
      }> => this.post('/api/setup/install-codex'),

      authCodex: (): Promise<{
        success: boolean;
        token?: string;
        requiresManualAuth?: boolean;
        terminalOpened?: boolean;
        command?: string;
        error?: string;
        message?: string;
        output?: string;
      }> => this.post('/api/setup/auth-codex'),

      deauthCodex: (): Promise<{
        success: boolean;
        requiresManualDeauth?: boolean;
        command?: string;
        message?: string;
        error?: string;
      }> => this.post('/api/setup/deauth-codex'),

      verifyCodexAuth: (
        authMethod: 'cli' | 'api_key',
        apiKey?: string
      ): Promise<{
        success: boolean;
        authenticated: boolean;
        error?: string;
      }> => this.post('/api/setup/verify-codex-auth', { authMethod, apiKey }),

      // OpenCode CLI methods
      getOpencodeStatus: (): Promise<{
        success: boolean;
        status?: string;
        installed?: boolean;
        method?: string;
        version?: string;
        path?: string;
        recommendation?: string;
        installCommands?: {
          macos?: string;
          linux?: string;
          npm?: string;
        };
        auth?: {
          authenticated: boolean;
          method: string;
          hasAuthFile?: boolean;
          hasOAuthToken?: boolean;
          hasApiKey?: boolean;
          hasStoredApiKey?: boolean;
          hasEnvApiKey?: boolean;
        };
        error?: string;
      }> => this.get('/api/setup/opencode-status'),

      // OpenCode Dynamic Model Discovery
      getOpencodeModels: (
        refresh?: boolean
      ): Promise<{
        success: boolean;
        models?: Array<{
          id: string;
          name: string;
          modelString: string;
          provider: string;
          description: string;
          supportsTools: boolean;
          supportsVision: boolean;
          tier: string;
          default?: boolean;
        }>;
        count?: number;
        cached?: boolean;
        error?: string;
      }> => this.get(`/api/setup/opencode/models${refresh ? '?refresh=true' : ''}`),

      refreshOpencodeModels: (): Promise<{
        success: boolean;
        models?: Array<{
          id: string;
          name: string;
          modelString: string;
          provider: string;
          description: string;
          supportsTools: boolean;
          supportsVision: boolean;
          tier: string;
          default?: boolean;
        }>;
        count?: number;
        error?: string;
      }> => this.post('/api/setup/opencode/models/refresh'),

      getOpencodeProviders: (): Promise<{
        success: boolean;
        providers?: Array<{
          id: string;
          name: string;
          authenticated: boolean;
          authMethod?: 'oauth' | 'api_key';
        }>;
        authenticated?: Array<{
          id: string;
          name: string;
          authenticated: boolean;
          authMethod?: 'oauth' | 'api_key';
        }>;
        error?: string;
      }> => this.get('/api/setup/opencode/providers'),

      clearOpencodeCache: (): Promise<{
        success: boolean;
        message?: string;
        error?: string;
      }> => this.post('/api/setup/opencode/cache/clear'),

      onInstallProgress: (callback: (progress: unknown) => void) => {
        return this.subscribeToEvent('agent:stream', callback);
      },

      onAuthProgress: (callback: (progress: unknown) => void) => {
        return this.subscribeToEvent('agent:stream', callback);
      },
    };

    // SetupLab Pipeline API (repo research, gap analysis, report generation)
    setupLab = {
      research: (
        projectPath: string
      ): Promise<{
        success: boolean;
        research?: RepoResearchResult;
        error?: string;
      }> => this.post('/api/setup/research', { projectPath }),

      gapAnalysis: (
        projectPath: string,
        research: RepoResearchResult,
        skipChecks?: string[]
      ): Promise<{
        success: boolean;
        report?: GapAnalysisReport;
        error?: string;
      }> => this.post('/api/setup/gap-analysis', { projectPath, research, skipChecks }),

      report: (
        projectPath: string,
        research: RepoResearchResult,
        gapReport: GapAnalysisReport
      ): Promise<{
        success: boolean;
        outputPath?: string;
        error?: string;
      }> => this.post('/api/setup/report', { projectPath, research, report: gapReport }),

      openReport: (
        reportPath: string
      ): Promise<{
        success: boolean;
        error?: string;
      }> => this.post('/api/setup/open-report', { reportPath }),

      propose: (
        projectPath: string,
        gapAnalysis: GapAnalysisReport,
        autoCreate?: boolean
      ): Promise<{
        success: boolean;
        proposal?: AlignmentProposal;
        featuresCreated?: number;
        error?: string;
      }> => this.post('/api/setup/propose', { projectPath, gapAnalysis, autoCreate }),
    };
  };
