import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PeerMeshService } from '../../src/services/peer-mesh-service.js';
import type { EventEmitter } from '../../src/lib/events.js';

// Mock loadProtoConfig from @protolabsai/platform
vi.mock('@protolabsai/platform', () => ({
  loadProtoConfig: vi.fn(),
}));

import { loadProtoConfig } from '@protolabsai/platform';

const mockLoadProtoConfig = vi.mocked(loadProtoConfig);

describe('PeerMeshService', () => {
  let service: PeerMeshService;

  beforeEach(() => {
    service = new PeerMeshService();
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
        hivemind: { enabled: true },
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
        hivemind: { enabled: true, peers: [] },
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
        hivemind: { enabled: true },
      } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
      await service.start('/fake/repo');
      await expect(service.shutdown()).resolves.toBeUndefined();
      const status = service.getSyncStatus();
      expect(status.connected).toBe(false);
    });
  });

  describe('primary-worker integration', () => {
    let primary: PeerMeshService;
    let worker: PeerMeshService;

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
      primary = new PeerMeshService();
      worker = new PeerMeshService();

      mockLoadProtoConfig
        .mockResolvedValueOnce({
          protolab: {
            role: 'primary',
            syncPort: port,
            instanceId: 'primary-node',
            instanceUrl: `ws://localhost:${port}`,
          },
          hivemind: { enabled: true },
        } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>)
        .mockResolvedValueOnce({
          protolab: {
            role: 'worker',
            instanceId: 'worker-node',
            instanceUrl: 'ws://localhost:19999',
          },
          hivemind: {
            enabled: true,
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
        hivemind: { enabled: true, peerTtlMs: 100, heartbeatIntervalMs: 10000 },
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

    it('peer eviction on TTL — peer is marked offline and absent from onlinePeers (isOnline false)', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        protolab: { role: 'primary', syncPort: 19884 },
        hivemind: { enabled: true, peerTtlMs: 100, heartbeatIntervalMs: 10000 },
      } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
      await service.start('/fake/repo');

      // Inject a peer whose lastSeen is already past the TTL
      const peers = (service as unknown as { peers: Map<string, unknown> }).peers;
      peers.set('evicted-peer', {
        identity: {
          instanceId: 'evicted-peer',
          capacity: { cores: 0, ramMb: 0, maxAgents: 0, runningAgents: 0 },
          domains: [],
          status: 'online',
        },
        lastSeen: new Date(Date.now() - 500).toISOString(), // 500ms ago, TTL is 100ms
      });

      // Advance past peerTtlMs to trigger eviction
      vi.advanceTimersByTime(10001);

      // Peer should be marked offline
      const allPeers = service.getPeers();
      const evictedPeer = allPeers.find((p) => p.identity.instanceId === 'evicted-peer');
      expect(evictedPeer).toBeDefined();
      expect(evictedPeer?.identity.status).toBe('offline');

      // isOnline check: evicted peer must not appear in getSyncStatus().onlinePeers
      const status = service.getSyncStatus();
      const onlinePeer = status.onlinePeers.find((p) => p.identity.instanceId === 'evicted-peer');
      expect(onlinePeer).toBeUndefined();
    });
  });

  // ─── Partition Recovery ────────────────────────────────────────────────────

  describe('partition recovery', () => {
    it('queues CRDT events in outboundQueue while not connected to primary', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        protolab: { role: 'worker', instanceId: 'worker-offline' },
        hivemind: { enabled: true, peers: [], heartbeatIntervalMs: 60000, peerTtlMs: 120000 },
      } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
      await service.start('/fake/repo');

      // No primary configured — wsClient remains null (disconnected)
      const internal = service as unknown as { wsClient: unknown; outboundQueue: string[] };
      expect(internal.wsClient).toBeNull();

      // Attach a mock event bus and capture the remote broadcaster
      let remoteBroadcaster: ((type: string, payload: Record<string, unknown>) => void) | null =
        null;
      const mockBus: Partial<EventEmitter> = {
        setRemoteBroadcaster: (fn) => {
          remoteBroadcaster = fn as (type: string, payload: Record<string, unknown>) => void;
        },
        on: vi.fn(),
        emit: vi.fn(),
        broadcast: vi.fn(),
        subscribe: vi.fn(),
      };
      service.attachEventBus(mockBus as unknown as EventEmitter);

      expect(remoteBroadcaster).not.toBeNull();

      // Broadcast two CRDT-synced events while disconnected — both should be queued.
      // Must use event types that are in CRDT_SYNCED_EVENT_TYPES (project:* and categories:updated).
      remoteBroadcaster!('project:created', { id: 'p1', name: 'Project One' });
      remoteBroadcaster!('project:updated', { id: 'p2', name: 'Project Two' });

      // Verify queue filled in order
      expect(internal.outboundQueue.length).toBe(2);

      const first = JSON.parse(internal.outboundQueue[0]) as {
        eventType: string;
        payload: { id: string };
      };
      const second = JSON.parse(internal.outboundQueue[1]) as {
        eventType: string;
        payload: { id: string };
      };
      expect(first.eventType).toBe('project:created');
      expect(first.payload.id).toBe('p1');
      expect(second.eventType).toBe('project:updated');
      expect(second.payload.id).toBe('p2');
    });

    describe('reconnect replay integration', () => {
      let primaryA: PeerMeshService | null;
      let primaryB: PeerMeshService | null;
      let partitionWorker: PeerMeshService;

      beforeEach(() => {
        vi.useRealTimers();
        primaryA = null;
        primaryB = null;
        partitionWorker = new PeerMeshService();
      });

      afterEach(async () => {
        await partitionWorker?.shutdown();
        if (primaryA) {
          await primaryA.shutdown();
          primaryA = null;
        }
        if (primaryB) {
          await primaryB.shutdown();
          primaryB = null;
        }
      });

      it('replays queued events to primary in order when partition heals', async () => {
        const port = 19880;

        // Start primary A
        mockLoadProtoConfig.mockResolvedValueOnce({
          protolab: { role: 'primary', syncPort: port, instanceId: 'primary-a' },
          hivemind: { enabled: true },
        } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
        primaryA = new PeerMeshService();
        await primaryA.start('/fake/repo-primary-a');

        // Start worker pointed at primary A
        mockLoadProtoConfig.mockResolvedValueOnce({
          protolab: {
            role: 'worker',
            instanceId: 'worker-rp',
            instanceUrl: 'ws://localhost:29999',
          },
          hivemind: {
            enabled: true,
            peers: [`ws://localhost:${port}`],
            heartbeatIntervalMs: 60000,
            peerTtlMs: 120000,
          },
        } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
        await partitionWorker.start('/fake/repo-worker');

        // Wait for initial connection to establish
        await new Promise((res) => setTimeout(res, 400));

        const workerInternal = partitionWorker as unknown as {
          wsClient: unknown;
          outboundQueue: string[];
          partitionSince: string | null;
          instanceId: string;
        };
        expect(workerInternal.wsClient).not.toBeNull();

        // Partition: shut down primary A
        await primaryA.shutdown();
        primaryA = null;

        // Wait for worker to detect the disconnect
        await new Promise((res) => setTimeout(res, 300));
        expect(workerInternal.partitionSince).not.toBeNull();

        // Enqueue two events (simulating CRDT changes that occurred during the partition)
        workerInternal.outboundQueue.push(
          JSON.stringify({
            type: 'feature_event',
            instanceId: workerInternal.instanceId,
            eventType: 'project:created',
            payload: { id: 'queued-1' },
            timestamp: new Date().toISOString(),
          })
        );
        workerInternal.outboundQueue.push(
          JSON.stringify({
            type: 'feature_event',
            instanceId: workerInternal.instanceId,
            eventType: 'project:updated',
            payload: { id: 'queued-2' },
            timestamp: new Date().toISOString(),
          })
        );
        expect(workerInternal.outboundQueue.length).toBe(2);

        // Partition heals: restart primary on the same port
        mockLoadProtoConfig.mockResolvedValueOnce({
          protolab: { role: 'primary', syncPort: port, instanceId: 'primary-b' },
          hivemind: { enabled: true },
        } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
        primaryB = new PeerMeshService();
        await primaryB.start('/fake/repo-primary-b');

        // Wait for the reconnect interval to fire (RECONNECT_INTERVAL_MS = 5000ms) + buffer
        await new Promise((res) => setTimeout(res, 6500));

        // Queue must be fully flushed and partition marker cleared
        expect(workerInternal.outboundQueue.length).toBe(0);
        expect(workerInternal.partitionSince).toBeNull();
      }, 12000);
    });
  });

  // ─── Registry Sync ─────────────────────────────────────────────────────────

  describe('registry sync', () => {
    describe('integration', () => {
      let registryPrimary: PeerMeshService;
      let registryWorker: PeerMeshService;

      beforeEach(() => {
        vi.useRealTimers();
        registryPrimary = new PeerMeshService();
        registryWorker = new PeerMeshService();
      });

      afterEach(async () => {
        await registryWorker?.shutdown();
        await registryPrimary?.shutdown();
      });

      it('primary sends registry_sync to connecting worker; worker calls adoptRemoteRegistry()', async () => {
        const port = 19881;

        // Configure primary with a known registry
        mockLoadProtoConfig.mockResolvedValueOnce({
          protolab: { role: 'primary', syncPort: port, instanceId: 'primary-rs' },
          hivemind: { enabled: true },
        } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
        registryPrimary.setRegistryProvider(() => ({
          'domain:doc-1': 'automerge://abc123',
          'domain:doc-2': 'automerge://def456',
        }));
        await registryPrimary.start('/fake/repo-primary');

        // Configure worker with a registry received callback (adoptRemoteRegistry equivalent)
        mockLoadProtoConfig.mockResolvedValueOnce({
          protolab: { role: 'worker', instanceId: 'worker-rs' },
          hivemind: {
            enabled: true,
            peers: [`ws://localhost:${port}`],
            heartbeatIntervalMs: 60000,
            peerTtlMs: 120000,
          },
        } as unknown as Awaited<ReturnType<typeof loadProtoConfig>>);
        const receivedRegistries: Array<Record<string, string>> = [];
        registryWorker.onRegistryReceived((reg) => receivedRegistries.push(reg));
        await registryWorker.start('/fake/repo-worker');

        // Wait for connection and registry_sync message to arrive
        await new Promise((res) => setTimeout(res, 400));

        // Worker's adoptRemoteRegistry callback should have been invoked
        expect(receivedRegistries.length).toBeGreaterThan(0);
        expect(receivedRegistries[0]).toMatchObject({
          'domain:doc-1': 'automerge://abc123',
          'domain:doc-2': 'automerge://def456',
        });
      });
    });
  });

  // ─── Settings Event Handling ───────────────────────────────────────────────

  describe('settings event handling', () => {
    it('publishSettings sends a settings_event message to a connected peer (worker → primary)', async () => {
      mockLoadProtoConfig.mockResolvedValue(null);
      await service.start('/fake/repo');

      // Inject a mock connected WebSocket client (simulates worker connected to primary)
      const sentMessages: string[] = [];
      const mockWs = {
        readyState: 1, // WebSocket.OPEN = 1
        send: vi.fn((msg: string) => sentMessages.push(msg)),
        terminate: vi.fn(), // called by shutdown()
      };
      (service as unknown as { wsClient: typeof mockWs }).wsClient = mockWs;

      service.publishSettings({ maxAgents: 5, theme: 'dark' });

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(sentMessages[0]) as {
        type: string;
        settings: Record<string, unknown>;
      };
      expect(sent.type).toBe('settings_event');
      expect(sent.settings).toEqual({ maxAgents: 5, theme: 'dark' });
    });

    it('onSettingsReceived callback fires when settings_event received from remote peer', async () => {
      mockLoadProtoConfig.mockResolvedValue(null);
      await service.start('/fake/repo');

      const receivedSettings: Array<Record<string, unknown>> = [];
      service.onSettingsReceived((settings) => receivedSettings.push(settings));

      // Retrieve the service's own instanceId so we can use a different one for the sender
      const ownInstanceId = (service as unknown as { instanceId: string }).instanceId;

      // Directly invoke the message handler with a settings_event from a different instance
      const mockWs = {} as unknown as { readyState: number };
      (
        service as unknown as {
          _handleMessage: (msg: unknown, ws: unknown) => void;
        }
      )._handleMessage(
        {
          type: 'settings_event',
          instanceId: `not-${ownInstanceId}`, // must differ to avoid self-loop guard
          settings: { theme: 'dark', autoMode: true },
          timestamp: new Date().toISOString(),
        },
        mockWs
      );

      expect(receivedSettings.length).toBe(1);
      expect(receivedSettings[0]).toEqual({ theme: 'dark', autoMode: true });
    });
  });
});
