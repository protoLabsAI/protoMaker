import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before any imports
vi.mock('@protolabsai/platform', () => ({
  loadProtoConfig: vi.fn(),
}));

vi.mock('@protolabsai/crdt', () => {
  const mockStore = {
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    attachServerAdapter: vi.fn(),
  };
  // Must use function (not arrow) so it can be called with `new`
  const CRDTStore = vi.fn(function () {
    return mockStore;
  });
  return {
    CRDTStore,
    WebSocketServerAdapter: vi.fn(function () {
      return {};
    }),
  };
});

vi.mock('ws', () => {
  const mockWss = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'listening') setTimeout(() => cb(), 0);
    }),
    close: vi.fn((cb: () => void) => cb()),
    clients: new Set(),
  };
  return {
    WebSocketServer: vi.fn(function () {
      return mockWss;
    }),
  };
});

import { loadProtoConfig } from '@protolabsai/platform';
import { CRDTStore } from '@protolabsai/crdt';
import { register } from '@/services/crdt-store.module.js';

const mockLoadProtoConfig = vi.mocked(loadProtoConfig);

function createMockContainer() {
  return {
    repoRoot: '/test/project',
    crdtSyncService: {
      getInstanceId: vi.fn(() => 'test-instance'),
    },
    avaChannelService: {
      setCrdtStore: vi.fn(),
    },
    calendarService: {
      setCrdtStore: vi.fn(),
    },
    todoService: {
      setCrdtStore: vi.fn(),
    },
  } as unknown as Parameters<typeof register>[0];
}

describe('crdt-store.module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register()', () => {
    it('should return null when no proto.config.yaml exists', async () => {
      mockLoadProtoConfig.mockResolvedValue(null);
      const container = createMockContainer();

      const result = await register(container);

      expect(result).toBeNull();
      expect(CRDTStore).not.toHaveBeenCalled();
    });

    it('should return null when hivemind is not enabled', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: false },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      const result = await register(container);

      expect(result).toBeNull();
      expect(CRDTStore).not.toHaveBeenCalled();
    });

    it('should return null when hivemind key is missing', async () => {
      mockLoadProtoConfig.mockResolvedValue(
        {} as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never
      );
      const container = createMockContainer();

      const result = await register(container);

      expect(result).toBeNull();
    });

    it('should initialize CRDTStore when hivemind is enabled', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true, peers: [] },
        protolab: { instanceId: 'node-a', syncPort: 4444, role: 'worker' },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      const result = await register(container);

      expect(result).not.toBeNull();
      expect(CRDTStore).toHaveBeenCalledWith({
        storageDir: '/test/project/.automaker/crdt',
        instanceId: 'node-a',
        peers: [],
        compactIntervalMs: 300000,
      });
    });

    it('should inject CRDTStore into all services', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true, peers: [] },
        protolab: { instanceId: 'node-a', syncPort: 4444, role: 'worker' },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      await register(container);

      const mockStoreInstance = vi.mocked(CRDTStore).mock.results[0].value;
      expect(container.avaChannelService.setCrdtStore).toHaveBeenCalledWith(mockStoreInstance);
      expect(container.calendarService.setCrdtStore).toHaveBeenCalledWith(mockStoreInstance);
      expect(container.todoService.setCrdtStore).toHaveBeenCalledWith(mockStoreInstance);
    });

    it('should call store.init()', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true, peers: [] },
        protolab: { instanceId: 'node-a', role: 'worker' },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      await register(container);

      const mockStoreInstance = vi.mocked(CRDTStore).mock.results[0].value;
      expect(mockStoreInstance.init).toHaveBeenCalled();
    });

    it('should start WebSocket server for primary role', async () => {
      const { WebSocketServer } = await import('ws');
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true, peers: [] },
        protolab: { instanceId: 'node-a', syncPort: 4444, role: 'primary' },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      await register(container);

      // WebSocketServer should be created with port 4445 (4444 + 1)
      expect(WebSocketServer).toHaveBeenCalledWith({ port: 4445 });
    });

    it('should NOT start WebSocket server for worker role', async () => {
      const { WebSocketServer } = await import('ws');
      vi.mocked(WebSocketServer).mockClear();
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true, peers: [] },
        protolab: { instanceId: 'node-a', role: 'worker' },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      await register(container);

      expect(WebSocketServer).not.toHaveBeenCalled();
    });

    it('should remap peer URLs to CRDT store port', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: {
          enabled: true,
          peers: ['ws://100.101.189.45:4444', 'ws://192.168.1.10:5000'],
        },
        protolab: { instanceId: 'node-a', syncPort: 4444, role: 'worker' },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      await register(container);

      expect(CRDTStore).toHaveBeenCalledWith(
        expect.objectContaining({
          peers: [{ url: 'ws://100.101.189.45:4445/' }, { url: 'ws://192.168.1.10:5001/' }],
        })
      );
    });

    it('should skip invalid peer URLs', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: {
          enabled: true,
          peers: ['ws://valid:4444', 'not-a-url', 'ws://also-valid:4444'],
        },
        protolab: { instanceId: 'node-a', role: 'worker' },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      await register(container);

      // Only valid URLs should be passed
      const config = vi.mocked(CRDTStore).mock.calls[0][0];
      expect(config.peers).toHaveLength(2);
    });

    it('should fall back to crdtSyncService instanceId when protolab is absent', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true, peers: [] },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      await register(container);

      expect(CRDTStore).toHaveBeenCalledWith(
        expect.objectContaining({ instanceId: 'test-instance' })
      );
    });

    it('should return a close function that shuts down store', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        hivemind: { enabled: true, peers: [] },
        protolab: { instanceId: 'node-a', role: 'worker' },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? NonNullable<T> : never);
      const container = createMockContainer();

      const result = await register(container);
      expect(result).not.toBeNull();

      await result!.close();

      const mockStoreInstance = vi.mocked(CRDTStore).mock.results[0].value;
      expect(mockStoreInstance.close).toHaveBeenCalled();
    });
  });
});
