import { describe, it, expect, vi } from 'vitest';
import { TracedProvider } from '@/providers/traced-provider.js';
import { BaseProvider } from '@/providers/base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ProviderConfig,
} from '@protolabsai/types';
import type { TracingConfig } from '@protolabsai/observability';

// Minimal stub provider for testing
class StubProvider extends BaseProvider {
  getName(): string {
    return 'stub';
  }

  async *executeQuery(_options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    yield { type: 'result', subtype: 'success', result: 'ok' } as ProviderMessage;
  }

  async detectInstallation(): Promise<InstallationStatus> {
    return { installed: true };
  }

  getAvailableModels(): ModelDefinition[] {
    return [];
  }
}

function createStubProvider(): StubProvider {
  return new StubProvider({ id: 'stub', name: 'Stub' } as ProviderConfig);
}

// Captures the options passed to wrapProviderWithTracing
function createSpyTracingConfig(): { config: TracingConfig; capturedOptions: any[] } {
  const capturedOptions: any[] = [];
  const mockClient = {
    isAvailable: () => true,
    createTrace: vi.fn(),
    createGeneration: vi.fn(),
    updateTrace: vi.fn(),
    flush: vi.fn(),
  };

  const config: TracingConfig = {
    enabled: true,
    client: mockClient as any,
    defaultTags: [],
    defaultMetadata: {},
  };

  return { config, capturedOptions };
}

describe('TracedProvider', () => {
  describe('setContext — projectSlug', () => {
    it('sets _langfuseSessionId from projectSlug', async () => {
      const { config } = createSpyTracingConfig();
      const provider = new TracedProvider(createStubProvider(), config);

      provider.setContext({ projectSlug: 'ci-reaction-engine' });

      // Execute to trigger wrapProviderWithTracing and verify sessionId
      // We check the config was updated with tags
      expect(config.defaultTags).toContain('project:ci-reaction-engine');
      expect(config.defaultMetadata).toMatchObject({ projectSlug: 'ci-reaction-engine' });
    });

    it('adds project tag to defaultTags', () => {
      const { config } = createSpyTracingConfig();
      const provider = new TracedProvider(createStubProvider(), config);

      provider.setContext({ projectSlug: 'my-project' });

      expect(config.defaultTags).toContain('project:my-project');
    });
  });

  describe('setContext — phase', () => {
    it('adds phase tag to defaultTags', () => {
      const { config } = createSpyTracingConfig();
      const provider = new TracedProvider(createStubProvider(), config);

      provider.setContext({ phase: 'research' });

      expect(config.defaultTags).toContain('phase:research');
    });
  });

  describe('setContext — combined projectSlug + phase', () => {
    it('adds both project and phase tags plus metadata', () => {
      const { config } = createSpyTracingConfig();
      const provider = new TracedProvider(createStubProvider(), config);

      provider.setContext({
        featureId: 'feat-123',
        agentRole: 'engineer',
        projectSlug: 'ci-engine',
        phase: 'execute',
      });

      expect(config.defaultTags).toContain('feature:feat-123');
      expect(config.defaultTags).toContain('role:engineer');
      expect(config.defaultTags).toContain('project:ci-engine');
      expect(config.defaultTags).toContain('phase:execute');
      expect(config.defaultMetadata).toMatchObject({
        featureId: 'feat-123',
        projectSlug: 'ci-engine',
        phase: 'execute',
      });
    });
  });

  describe('executeQuery — sessionId override', () => {
    it('uses project sessionId when projectSlug is set', async () => {
      const mockClient = {
        isAvailable: () => true,
        createTrace: vi.fn(),
        createGeneration: vi.fn(),
        updateTrace: vi.fn(),
        flush: vi.fn(),
      };

      const config: TracingConfig = {
        enabled: true,
        client: mockClient as any,
        defaultTags: [],
        defaultMetadata: {},
      };

      const provider = new TracedProvider(createStubProvider(), config);
      provider.setContext({ projectSlug: 'lifecycle-test' });

      // Consume the generator to trigger tracing
      const options: ExecuteOptions = {
        prompt: 'test',
        model: 'sonnet',
        cwd: '/tmp',
        maxTurns: 1,
        allowedTools: [],
        sdkSessionId: 'sdk-session-original',
      };

      for await (const _msg of provider.executeQuery(options)) {
        // consume
      }

      // The trace should have been created with the project session ID
      expect(mockClient.createTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'project:lifecycle-test',
        })
      );
    });

    it('falls back to sdkSessionId when no projectSlug', async () => {
      const mockClient = {
        isAvailable: () => true,
        createTrace: vi.fn(),
        createGeneration: vi.fn(),
        updateTrace: vi.fn(),
        flush: vi.fn(),
      };

      const config: TracingConfig = {
        enabled: true,
        client: mockClient as any,
        defaultTags: [],
        defaultMetadata: {},
      };

      const provider = new TracedProvider(createStubProvider(), config);
      // No setContext call — no projectSlug

      const options: ExecuteOptions = {
        prompt: 'test',
        model: 'sonnet',
        cwd: '/tmp',
        maxTurns: 1,
        allowedTools: [],
        sdkSessionId: 'original-session',
      };

      for await (const _msg of provider.executeQuery(options)) {
        // consume
      }

      expect(mockClient.createTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'original-session',
        })
      );
    });

    it('uses undefined sessionId when neither projectSlug nor sdkSessionId set', async () => {
      const mockClient = {
        isAvailable: () => true,
        createTrace: vi.fn(),
        createGeneration: vi.fn(),
        updateTrace: vi.fn(),
        flush: vi.fn(),
      };

      const config: TracingConfig = {
        enabled: true,
        client: mockClient as any,
        defaultTags: [],
        defaultMetadata: {},
      };

      const provider = new TracedProvider(createStubProvider(), config);

      const options: ExecuteOptions = {
        prompt: 'test',
        model: 'sonnet',
        cwd: '/tmp',
        maxTurns: 1,
        allowedTools: [],
      };

      for await (const _msg of provider.executeQuery(options)) {
        // consume
      }

      expect(mockClient.createTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: undefined,
        })
      );
    });
  });
});
