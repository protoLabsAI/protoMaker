/**
 * Unit tests for the AvaChannelReactorModule register() function.
 *
 * Covers:
 * - Returns null when hivemind is disabled
 * - Returns null when reactorEnabled feature flag is off
 * - Returns null when proto.config.yaml is absent
 * - Returns null when CRDTStore is not on the container
 * - Calls service.start() and returns a result when hivemind enabled + flag on
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before any imports
vi.mock('@protolabsai/platform', () => ({
  loadProtoConfig: vi.fn(),
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock AvaChannelReactorService so we can inspect start/stop calls
vi.mock('@/services/ava-channel-reactor-service.js', () => {
  const mockServiceInstance = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    getStatus: vi.fn(() => ({ active: true })),
  };

  const AvaChannelReactorService = vi.fn(function () {
    return mockServiceInstance;
  });

  return { AvaChannelReactorService };
});

import { loadProtoConfig } from '@protolabsai/platform';
import { AvaChannelReactorService } from '@/services/ava-channel-reactor-service.js';
import { register } from '@/services/ava-channel-reactor.module.js';

const mockLoadProtoConfig = vi.mocked(loadProtoConfig);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContainer(
  overrides: {
    reactorEnabled?: boolean;
    hasCrdtStore?: boolean;
    settingsThrows?: boolean;
  } = {}
) {
  const { reactorEnabled = true, hasCrdtStore = true, settingsThrows = false } = overrides;

  const container: Record<string, unknown> = {
    repoRoot: '/test/project',
    settingsService: {
      getGlobalSettings: settingsThrows
        ? vi.fn().mockRejectedValue(new Error('settings error'))
        : vi.fn().mockResolvedValue({
            featureFlags: { reactorEnabled },
            avaChannelReactor: { enabled: true },
          }),
    },
    avaChannelService: {
      postMessage: vi.fn().mockResolvedValue({ id: 'posted-1' }),
    },
    crdtSyncService: {
      getInstanceId: vi.fn(() => 'test-instance-id'),
    },
    autoModeService: {
      getCapacityMetrics: vi.fn(() => ({ runningAgents: 0, maxAgents: 5, backlogCount: 0 })),
    },
  };

  if (hasCrdtStore) {
    container._crdtStore = {
      getOrCreate: vi.fn().mockResolvedValue({ docSync: vi.fn(() => ({ messages: [] })) }),
      subscribe: vi.fn(() => vi.fn()),
    };
  }

  return container as unknown as Parameters<typeof register>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ava-channel-reactor.module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register()', () => {
    it('returns null when settingsService throws', async () => {
      mockLoadProtoConfig.mockResolvedValue(null);
      const container = createMockContainer({ settingsThrows: true });

      const result = await register(container);

      expect(result).toBeNull();
    });

    it('returns null when reactorEnabled feature flag is off', async () => {
      const container = createMockContainer({ reactorEnabled: false });

      const result = await register(container);

      expect(result).toBeNull();
      expect(loadProtoConfig).not.toHaveBeenCalled();
    });

    it('returns null when proto.config.yaml is absent (single-instance mode)', async () => {
      mockLoadProtoConfig.mockResolvedValue(null);
      const container = createMockContainer({ reactorEnabled: true });

      const result = await register(container);

      expect(result).toBeNull();
    });

    it('returns null when hivemind is disabled in proto.config.yaml', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: false },
      } as Awaited<ReturnType<typeof loadProtoConfig>>);
      const container = createMockContainer({ reactorEnabled: true });

      const result = await register(container);

      expect(result).toBeNull();
    });

    it('returns null when hivemind key is absent in proto.config.yaml', async () => {
      mockLoadProtoConfig.mockResolvedValue({} as Awaited<ReturnType<typeof loadProtoConfig>>);
      const container = createMockContainer({ reactorEnabled: true });

      const result = await register(container);

      expect(result).toBeNull();
    });

    it('returns null when CRDTStore is not available on the container', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true },
      } as Awaited<ReturnType<typeof loadProtoConfig>>);
      const container = createMockContainer({ reactorEnabled: true, hasCrdtStore: false });

      const result = await register(container);

      expect(result).toBeNull();
    });

    it('calls service.start() when hivemind is enabled and flag is on', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true },
      } as Awaited<ReturnType<typeof loadProtoConfig>>);
      const container = createMockContainer({ reactorEnabled: true, hasCrdtStore: true });

      const result = await register(container);

      expect(result).not.toBeNull();
      expect(AvaChannelReactorService).toHaveBeenCalledOnce();
      const mockInstance = vi.mocked(AvaChannelReactorService).mock.results[0].value;
      expect(mockInstance.start).toHaveBeenCalledOnce();
    });

    it('returns a stop function that calls service.stop()', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true },
      } as Awaited<ReturnType<typeof loadProtoConfig>>);
      const container = createMockContainer({ reactorEnabled: true, hasCrdtStore: true });

      const result = await register(container);

      expect(result).not.toBeNull();
      result!.stop();

      const mockInstance = vi.mocked(AvaChannelReactorService).mock.results[0].value;
      expect(mockInstance.stop).toHaveBeenCalledOnce();
    });

    it('passes crdtSyncService instanceId to the service', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true },
      } as Awaited<ReturnType<typeof loadProtoConfig>>);
      const container = createMockContainer({ reactorEnabled: true, hasCrdtStore: true });

      await register(container);

      expect(AvaChannelReactorService).toHaveBeenCalledWith(
        expect.objectContaining({ instanceId: 'test-instance-id' })
      );
    });
  });
});
