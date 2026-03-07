import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CrdtSyncService } from '../../src/services/crdt-sync-service.js';

// Mock loadProtoConfig from @protolabsai/platform
vi.mock('@protolabsai/platform', () => ({
  loadProtoConfig: vi.fn(),
}));

import { loadProtoConfig } from '@protolabsai/platform';

const mockLoadProtoConfig = vi.mocked(loadProtoConfig);

describe('CrdtSyncService', () => {
  let service: CrdtSyncService;

  beforeEach(() => {
    service = new CrdtSyncService();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await service.shutdown();
    vi.useRealTimers();
  });

  describe('startup', () => {
    it('starts as worker by default when no proto config found', async () => {
      mockLoadProtoConfig.mockResolvedValue(null);
      await service.start('/fake/repo');
      const status = service.getSyncStatus();
      expect(status.role).toBe('worker');
      expect(status.isLeader).toBe(false);
      expect(status.syncPort).toBeNull();
    });

    it('starts as primary when proto config has role:primary', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        protolab: { role: 'primary', syncPort: 19876 },
      } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
      await service.start('/fake/repo');
      const status = service.getSyncStatus();
      expect(status.role).toBe('primary');
      expect(status.isLeader).toBe(true);
      expect(status.syncPort).toBe(19876);
      expect(status.connected).toBe(true);
    });

    it('starts as worker when proto config has role:worker', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        protolab: { role: 'worker', syncPort: 19876 },
        hivemind: { peers: [] },
      } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
      await service.start('/fake/repo');
      const status = service.getSyncStatus();
      expect(status.role).toBe('worker');
      expect(status.isLeader).toBe(false);
      expect(status.syncPort).toBeNull();
    });

    it('does not start twice', async () => {
      mockLoadProtoConfig.mockResolvedValue(null);
      await service.start('/fake/repo');
      // Second start should be a no-op (no error)
      await service.start('/fake/repo');
      expect(mockLoadProtoConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSyncStatus', () => {
    it('returns initial disconnected state before start', () => {
      const status = service.getSyncStatus();
      expect(status.role).toBe('worker');
      expect(status.connected).toBe(false);
      expect(status.peerCount).toBe(0);
      expect(status.onlinePeers).toEqual([]);
    });
  });

  describe('getPeers', () => {
    it('returns empty array when no peers', async () => {
      mockLoadProtoConfig.mockResolvedValue(null);
      await service.start('/fake/repo');
      expect(service.getPeers()).toEqual([]);
    });
  });

  describe('shutdown', () => {
    it('shuts down cleanly without error when not started', async () => {
      // Should not throw
      await expect(service.shutdown()).resolves.toBeUndefined();
    });

    it('shuts down primary server cleanly', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        protolab: { role: 'primary', syncPort: 19877 },
      } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
      await service.start('/fake/repo');
      await expect(service.shutdown()).resolves.toBeUndefined();
      const status = service.getSyncStatus();
      expect(status.connected).toBe(false);
    });
  });

  describe('primary-worker integration', () => {
    let primary: CrdtSyncService;
    let worker: CrdtSyncService;

    beforeEach(() => {
      // Use real timers for WebSocket integration tests
      vi.useRealTimers();
    });

    afterEach(async () => {
      await primary?.shutdown();
      await worker?.shutdown();
    });

    it('worker connects to primary and primary tracks peer identity', async () => {
      const port = 19878;
      primary = new CrdtSyncService();
      worker = new CrdtSyncService();

      mockLoadProtoConfig
        .mockResolvedValueOnce({
          protolab: {
            role: 'primary',
            syncPort: port,
            instanceId: 'primary-node',
            instanceUrl: `ws://localhost:${port}`,
          },
        } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>)
        .mockResolvedValueOnce({
          protolab: {
            role: 'worker',
            instanceId: 'worker-node',
            instanceUrl: 'ws://localhost:19999',
          },
          hivemind: {
            peers: [`ws://localhost:${port}`],
            heartbeatIntervalMs: 60000,
            peerTtlMs: 120000,
          },
        } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);

      await primary.start('/fake/repo-primary');
      await worker.start('/fake/repo-worker');

      // Give connection time to establish
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Worker should be in worker role
      const workerStatus = worker.getSyncStatus();
      expect(workerStatus.role).toBe('worker');

      // Primary should have worker as peer
      const primaryPeers = primary.getPeers();
      expect(primaryPeers.length).toBeGreaterThan(0);
      const workerPeer = primaryPeers.find((p) => p.identity.instanceId === 'worker-node');
      expect(workerPeer).toBeDefined();
      expect(workerPeer?.identity.status).toBe('online');
    });
  });

  describe('peer TTL enforcement', () => {
    it('marks peers offline after TTL expires', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        protolab: { role: 'primary', syncPort: 19879 },
        hivemind: { peerTtlMs: 100, heartbeatIntervalMs: 10000 },
      } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
      await service.start('/fake/repo');

      // Manually inject a peer with an old lastSeen
      const peers = (service as unknown as { peers: Map<string, unknown> }).peers;
      peers.set('stale-peer', {
        identity: {
          instanceId: 'stale-peer',
          capacity: { cores: 0, ramMb: 0, maxAgents: 0, runningAgents: 0 },
          domains: [],
          status: 'online',
        },
        lastSeen: new Date(Date.now() - 200).toISOString(), // 200ms ago, TTL is 100ms
      });

      // Advance timers to trigger TTL check (runs every 10s)
      vi.advanceTimersByTime(10001);

      const peers2 = service.getPeers();
      const stalePeer = peers2.find((p) => p.identity.instanceId === 'stale-peer');
      expect(stalePeer?.identity.status).toBe('offline');
    });
  });
});
