import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMCPServersFromSettings,
  getWorkflowSettings,
  getEffectivePrBaseBranch,
} from '@/lib/settings-helpers.js';
import type { SettingsService } from '@/services/settings-service.js';
import { DEFAULT_WORKFLOW_SETTINGS } from '@protolabsai/types';

// Mock the logger
vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return {
    ...actual,
    createLogger: () => mockLogger,
  };
});

describe('settings-helpers.ts', () => {
  describe('getMCPServersFromSettings', () => {
    // Default MCP servers always included (Context7)
    const DEFAULT_SERVERS = {
      context7: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        env: process.env.CONTEXT7_API_KEY
          ? { CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY }
          : undefined,
      },
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return defaults when settingsService is null', async () => {
      const result = await getMCPServersFromSettings(null);
      expect(result).toEqual(DEFAULT_SERVERS);
    });

    it('should return defaults when settingsService is undefined', async () => {
      const result = await getMCPServersFromSettings(undefined);
      expect(result).toEqual(DEFAULT_SERVERS);
    });

    it('should return defaults when no MCP servers configured', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({ mcpServers: [] }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual(DEFAULT_SERVERS);
    });

    it('should return defaults when mcpServers is undefined', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual(DEFAULT_SERVERS);
    });

    it('should convert enabled stdio server to SDK format', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'test-server',
              type: 'stdio',
              command: 'node',
              args: ['server.js'],
              env: { NODE_ENV: 'test' },
              enabled: true,
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({
        ...DEFAULT_SERVERS,
        'test-server': {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'test' },
        },
      });
    });

    it('should convert enabled SSE server to SDK format', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'sse-server',
              type: 'sse',
              url: 'http://localhost:3000/sse',
              headers: { Authorization: 'Bearer token' },
              enabled: true,
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({
        ...DEFAULT_SERVERS,
        'sse-server': {
          type: 'sse',
          url: 'http://localhost:3000/sse',
          headers: { Authorization: 'Bearer token' },
        },
      });
    });

    it('should convert enabled HTTP server to SDK format', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'http-server',
              type: 'http',
              url: 'http://localhost:3000/api',
              headers: { 'X-API-Key': 'secret' },
              enabled: true,
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual({
        ...DEFAULT_SERVERS,
        'http-server': {
          type: 'http',
          url: 'http://localhost:3000/api',
          headers: { 'X-API-Key': 'secret' },
        },
      });
    });

    it('should filter out disabled servers', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'enabled-server',
              type: 'stdio',
              command: 'node',
              enabled: true,
            },
            {
              id: '2',
              name: 'disabled-server',
              type: 'stdio',
              command: 'python',
              enabled: false,
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      // 1 enabled user server + defaults (context7)
      expect(result['enabled-server']).toBeDefined();
      expect(result['disabled-server']).toBeUndefined();
      expect(result['context7']).toBeDefined();
    });

    it('should treat servers without enabled field as enabled', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'implicit-enabled',
              type: 'stdio',
              command: 'node',
              // enabled field not set
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result['implicit-enabled']).toBeDefined();
    });

    it('should handle multiple enabled servers', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            { id: '1', name: 'server1', type: 'stdio', command: 'node', enabled: true },
            { id: '2', name: 'server2', type: 'stdio', command: 'python', enabled: true },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      // 2 user servers + defaults (context7)
      expect(result['server1']).toBeDefined();
      expect(result['server2']).toBeDefined();
      expect(result['context7']).toBeDefined();
    });

    it('should return defaults and log error on exception', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockRejectedValue(new Error('Settings error')),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService, '[Test]');
      expect(result).toEqual(DEFAULT_SERVERS);
      // Logger will be called with error, but we don't need to assert it
    });

    it('should return defaults for SSE server without URL', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'bad-sse',
              type: 'sse',
              enabled: true,
              // url missing
            },
          ],
        }),
      } as unknown as SettingsService;

      // The error is caught and logged, returns defaults
      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual(DEFAULT_SERVERS);
    });

    it('should return defaults for HTTP server without URL', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'bad-http',
              type: 'http',
              enabled: true,
              // url missing
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual(DEFAULT_SERVERS);
    });

    it('should return defaults for stdio server without command', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'bad-stdio',
              type: 'stdio',
              enabled: true,
              // command missing
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result).toEqual(DEFAULT_SERVERS);
    });

    it('should default to stdio type when type is not specified', async () => {
      const mockSettingsService = {
        getGlobalSettings: vi.fn().mockResolvedValue({
          mcpServers: [
            {
              id: '1',
              name: 'no-type',
              command: 'node',
              enabled: true,
              // type not specified, should default to stdio
            },
          ],
        }),
      } as unknown as SettingsService;

      const result = await getMCPServersFromSettings(mockSettingsService);
      expect(result['context7']).toBeDefined();
      expect(result['no-type']).toEqual({
        type: 'stdio',
        command: 'node',
        args: undefined,
        env: undefined,
      });
    });
  });

  describe('getWorkflowSettings', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return DEFAULT_WORKFLOW_SETTINGS when settingsService is null', async () => {
      const result = await getWorkflowSettings('/some/path', null);
      expect(result).toEqual(DEFAULT_WORKFLOW_SETTINGS);
    });

    it('should return DEFAULT_WORKFLOW_SETTINGS when no workflow settings configured', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getWorkflowSettings('/some/path', mockSettingsService);
      expect(result).toEqual(DEFAULT_WORKFLOW_SETTINGS);
    });

    it('should preserve preFlightChecks=true through merge when set explicitly', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({
          workflow: { preFlightChecks: true },
        }),
      } as unknown as SettingsService;

      const result = await getWorkflowSettings('/some/path', mockSettingsService);
      expect(result.preFlightChecks).toBe(true);
    });

    it('should preserve preFlightChecks=false through merge when set explicitly', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({
          workflow: { preFlightChecks: false },
        }),
      } as unknown as SettingsService;

      const result = await getWorkflowSettings('/some/path', mockSettingsService);
      expect(result.preFlightChecks).toBe(false);
    });

    it('should default preFlightChecks to true when field is missing from workflow settings', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({
          workflow: {
            // preFlightChecks intentionally omitted — should default to true
            postMergeVerification: false,
          },
        }),
      } as unknown as SettingsService;

      const result = await getWorkflowSettings('/some/path', mockSettingsService);
      expect(result.preFlightChecks).toBe(true);
    });

    it('should return DEFAULT_WORKFLOW_SETTINGS on error', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockRejectedValue(new Error('Settings read error')),
      } as unknown as SettingsService;

      const result = await getWorkflowSettings('/some/path', mockSettingsService);
      expect(result).toEqual(DEFAULT_WORKFLOW_SETTINGS);
    });

    it('should merge other workflow fields alongside preFlightChecks', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({
          workflow: {
            preFlightChecks: false,
            postMergeVerification: false,
            pipeline: { goalGatesEnabled: false },
          },
        }),
      } as unknown as SettingsService;

      const result = await getWorkflowSettings('/some/path', mockSettingsService);
      expect(result.preFlightChecks).toBe(false);
      expect(result.postMergeVerification).toBe(false);
      // Other pipeline defaults should be preserved
      expect(result.pipeline.checkpointEnabled).toBe(true);
      expect(result.pipeline.goalGatesEnabled).toBe(false);
    });
  });

  describe('getEffectivePrBaseBranch', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch (dev) when settingsService is null and git detect fails', async () => {
      const result = await getEffectivePrBaseBranch('/some/path', null);
      expect(result).toBe('dev');
    });

    it('should return project-level prBaseBranch when set in project workflow gitWorkflow settings', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({
          workflow: { gitWorkflow: { prBaseBranch: 'feature-branch' } },
        }),
        getGlobalSettings: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getEffectivePrBaseBranch('/some/path', mockSettingsService);
      expect(result).toBe('feature-branch');
      expect(mockSettingsService.getGlobalSettings).not.toHaveBeenCalled();
    });

    it('should return global-level prBaseBranch when project has none but global does', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({}),
        getGlobalSettings: vi.fn().mockResolvedValue({
          gitWorkflow: { prBaseBranch: 'staging' },
        }),
      } as unknown as SettingsService;

      const result = await getEffectivePrBaseBranch('/some/path', mockSettingsService);
      expect(result).toBe('staging');
    });

    it('should fall back to dev when neither project nor global settings define prBaseBranch and git detect fails', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({}),
        getGlobalSettings: vi.fn().mockResolvedValue({}),
      } as unknown as SettingsService;

      const result = await getEffectivePrBaseBranch('/nonexistent/path', mockSettingsService);
      expect(result).toBe('dev');
    });

    it('should fall back to dev when settings service throws', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockRejectedValue(new Error('Settings read error')),
        getGlobalSettings: vi.fn().mockRejectedValue(new Error('Settings read error')),
      } as unknown as SettingsService;

      const result = await getEffectivePrBaseBranch('/nonexistent/path', mockSettingsService);
      expect(result).toBe('dev');
    });

    it('should prefer project-level over global-level when both are set', async () => {
      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({
          workflow: { gitWorkflow: { prBaseBranch: 'project-branch' } },
        }),
        getGlobalSettings: vi.fn().mockResolvedValue({
          gitWorkflow: { prBaseBranch: 'global-branch' },
        }),
      } as unknown as SettingsService;

      const result = await getEffectivePrBaseBranch('/some/path', mockSettingsService);
      expect(result).toBe('project-branch');
    });
  });
});
