/**
 * PeerMeshService — sync server lifecycle for multi-instance coordination.
 *
 * Reads proto.config.yaml to determine instance role (primary/worker) and
 * sync port. The primary instance starts a WebSocket sync server; workers
 * connect as clients. Implements heartbeat protocol using HivemindPeer types,
 * peer TTL enforcement, and leader election when the primary goes unreachable.
 *
 * When hivemind.enabled is false in proto.config.yaml, this service is a no-op:
 * no timers, no WebSocket server, no peer connections are started.
 */

import os from 'node:os';
import { WebSocket, WebSocketServer } from 'ws';
import { createLogger } from '@protolabsai/utils';
import { loadProtoConfig } from '@protolabsai/platform';
import type {
  HivemindPeer,
  HivemindConfig,
  InstanceCapacity,
  InstanceRole,
  SyncRole,
  SyncServerStatus,
} from '@protolabsai/types';
import type { EventType } from '@protolabsai/types';

/**
 * Event types that propagate across PeerMesh instances.
 * Features are LOCAL to each instance (never cross the wire).
 * Only projects and shared coordination events are synced.
 */
const CRDT_SYNCED_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'project:created',
  'project:updated',
  'project:deleted',
  'categories:updated',
]);

/**
 * Wire message carrying a local EventBus event to remote instances.
 * Transported as JSON over the sync WebSocket channel.
 */
interface CrdtSyncWireMessage {
  type: 'feature_event';
  /** Originating instance ID — receivers skip re-emit if it matches self */
  instanceId: string;
  eventType: EventType;
  payload: unknown;
  timestamp: string;
  /** Project name from proto.config.yaml — receivers reject events for foreign projects */
  projectName?: string;
}
import type { EventEmitter } from '../lib/events.js';
import {
  CRDT_HEARTBEAT_MS,
  CRDT_TTL_MS,
  CRDT_RECONNECT_INTERVAL_MS,
  CRDT_TTL_CHECK_INTERVAL_MS,
} from '../config/timeouts.js';

const logger = createLogger('PeerMeshService');

const DEFAULT_HEARTBEAT_MS = CRDT_HEARTBEAT_MS;
const DEFAULT_TTL_MS = CRDT_TTL_MS;
const DEFAULT_SYNC_PORT = 4444;
const RECONNECT_INTERVAL_MS = CRDT_RECONNECT_INTERVAL_MS;
const TTL_CHECK_INTERVAL_MS = CRDT_TTL_CHECK_INTERVAL_MS;

interface PeerMessage {
  type: 'heartbeat' | 'goodbye' | 'identity' | 'promote';
  instanceId: string;
  /** Human-readable display name from proto.config.yaml instance.name */
  name?: string;
  /** Primary work focus role from proto.config.yaml instance.role */
  role?: InstanceRole;
  /** Additional capability tags from proto.config.yaml instance.tags */
  tags?: string[];
  url?: string;
  timestamp: string;
  priority?: number;
  /** Capacity metrics published by the sender on every heartbeat */
  capacity?: InstanceCapacity;
}

/**
 * Wire message carrying shared settings from one instance to all peers.
 * Credentials and API keys MUST NOT be included in the settings payload.
 */
interface CrdtSettingsEvent {
  type: 'settings_event';
  instanceId: string;
  settings: Record<string, unknown>;
  timestamp: string;
}

/**
 * Wire message carrying the CRDTStore document registry from primary to workers.
 * Resolves split-brain where both instances independently created Automerge
 * documents for the same domain:id with different URLs.
 */
interface CrdtRegistrySyncEvent {
  type: 'registry_sync';
  instanceId: string;
  registry: Record<string, string>;
  timestamp: string;
}

type SyncMessage = PeerMessage | CrdtSyncWireMessage | CrdtSettingsEvent | CrdtRegistrySyncEvent;

interface TrackedPeer extends HivemindPeer {
  ws?: WebSocket;
  priority?: number;
}

export class PeerMeshService {
  private role: SyncRole = 'worker';
  private syncPort = DEFAULT_SYNC_PORT;
  private config: HivemindConfig | null = null;
  private wsServer: WebSocketServer | null = null;
  private wsClient: WebSocket | null = null;
  /** In-flight WebSocket during reconnect (not yet promoted to wsClient). */
  private pendingWs: WebSocket | null = null;
  private peers = new Map<string, TrackedPeer>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private ttlTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private instanceId: string;
  /** Human-readable display name from proto.config.yaml instance.name */
  private instanceName: string | undefined;
  /** Primary work focus role from proto.config.yaml instance.role */
  private instanceRole: InstanceRole | undefined;
  /** Additional capability tags from proto.config.yaml instance.tags */
  private instanceTags: string[] | undefined;
  private instanceUrl: string | null = null;
  /** Project name from proto.config.yaml — used to scope CRDT sync to same-project peers */
  private projectName: string | null = null;
  private primaryUrl: string | null = null;
  private lastPrimaryContact: number | null = null;
  private selfPriority = -1;
  private promotionPending = false;
  private _eventBus: EventEmitter | null = null;
  private _settingsCallback: ((settings: Record<string, unknown>) => void) | null = null;
  private _remoteFeatureCallback:
    | ((eventType: string, payload: Record<string, unknown>) => void)
    | null = null;
  private _capacityProvider: (() => InstanceCapacity) | null = null;
  /** ISO timestamp when this instance last lost sync connectivity (network partition) */
  private partitionSince: string | null = null;
  /** Event messages queued for replay while disconnected from the sync mesh */
  private outboundQueue: string[] = [];
  /**
   * Optional callback for posting bug reports to the Ava Channel.
   * Invoked when a 'bug:reported' event is received on the EventBus.
   */
  private _avaChannelBugReportCallback:
    | ((content: string, featureId?: string) => Promise<void>)
    | null = null;
  /** Returns the CRDTStore registry (primary broadcasts this to workers). */
  private _registryProvider: (() => Record<string, string>) | null = null;
  /** Called when a worker receives a registry from the primary. */
  private _registryReceivedCallback: ((registry: Record<string, string>) => void) | null = null;

  constructor() {
    this.instanceId = os.hostname();
  }

  /**
   * Register a callback invoked when shared settings arrive from a remote peer.
   * The callback receives a plain settings record (never contains credentials).
   * Call this before `start()`.
   */
  onSettingsReceived(callback: (settings: Record<string, unknown>) => void): void {
    this._settingsCallback = callback;
  }

  /**
   * Register a callback invoked when a remote peer sends a feature event.
   * Used to persist remote feature changes locally (create/update/delete/status-change).
   * Call this before `start()`.
   */
  onRemoteFeatureEvent(
    callback: (eventType: string, payload: Record<string, unknown>) => void
  ): void {
    this._remoteFeatureCallback = callback;
  }

  /**
   * Register a callback that returns this instance's current capacity metrics.
   * Called on every heartbeat to include fresh metrics in the outgoing message.
   * Must be called before `start()`.
   */
  setCapacityProvider(provider: () => InstanceCapacity): void {
    this._capacityProvider = provider;
  }

  /**
   * Register a callback that posts bug reports to the Ava Channel as system messages.
   * When set, any 'bug:reported' event on the attached EventBus will invoke this callback
   * with the report content and optional featureId.
   *
   * Must be called before or after attachEventBus(); safe to call multiple times.
   */
  attachAvaChannelBugReporter(
    callback: (content: string, featureId?: string) => Promise<void>
  ): void {
    this._avaChannelBugReportCallback = callback;
  }

  /**
   * Register a provider that returns the local CRDTStore document registry.
   * The primary uses this to broadcast the registry to connecting workers.
   */
  setRegistryProvider(provider: () => Record<string, string>): void {
    this._registryProvider = provider;
  }

  /**
   * Register a callback invoked when a worker receives a registry_sync message
   * from the primary. The callback should merge the remote registry into the
   * local CRDTStore to resolve split-brain document URLs.
   */
  onRegistryReceived(callback: (registry: Record<string, string>) => void): void {
    this._registryReceivedCallback = callback;
  }

  /**
   * Broadcast shared settings to all connected peers.
   * Credentials and API keys MUST NOT be included in the settings object.
   */
  publishSettings(settings: Record<string, unknown>): void {
    if (!this.started) return;

    const msg: CrdtSettingsEvent = {
      type: 'settings_event',
      instanceId: this.instanceId,
      settings,
      timestamp: new Date().toISOString(),
    };
    const raw = JSON.stringify(msg);

    if (this.role === 'primary') {
      this._broadcastToServer(raw);
    } else if (this.wsClient?.readyState === WebSocket.OPEN) {
      try {
        this.wsClient.send(raw);
      } catch {
        // Best effort
      }
    }
  }

  /**
   * Attach an EventBus to bridge CRDT sync with the local event system.
   *
   * - Registers a remote broadcaster: when `broadcast()` is called locally for
   *   a synced event type, the event is published to all connected peers.
   *   Synced event types include both feature events (feature:created, feature:updated,
   *   feature:deleted, feature:status-changed) and project events (project:created,
   *   project:updated, project:deleted).
   * - Incoming `feature_event` CRDT messages trigger a local `emit()` (NOT
   *   `broadcast()`) to prevent feedback loops.
   *
   * Must be called before `start()` or immediately after; safe to call multiple
   * times (replaces previous registration).
   */
  attachEventBus(bus: EventEmitter): void {
    this._eventBus = bus;

    // Subscribe to 'bug:reported' events and forward to the Ava Channel as system messages.
    // This handler uses bus.on() for a targeted subscription rather than a global listener.
    bus.on('bug:reported', (payload) => {
      if (!this._avaChannelBugReportCallback) return;
      this._avaChannelBugReportCallback(payload.content, payload.featureId).catch(
        (err: unknown) => {
          logger.error('[PeerMesh] Failed to post bug report to Ava Channel:', err);
        }
      );
    });

    bus.setRemoteBroadcaster((type, payload) => {
      if (!CRDT_SYNCED_EVENT_TYPES.has(type)) return;
      if (!this.started) return;

      const msg: CrdtSyncWireMessage = {
        type: 'feature_event',
        instanceId: this.instanceId,
        eventType: type,
        payload,
        timestamp: new Date().toISOString(),
        projectName: this.projectName ?? undefined,
      };
      const raw = JSON.stringify(msg);

      if (this.role === 'primary') {
        this._broadcastToServer(raw);
      } else if (this.wsClient?.readyState === WebSocket.OPEN) {
        try {
          this.wsClient.send(raw);
        } catch {
          // Queue for replay on next reconnect
          this.outboundQueue.push(raw);
        }
      } else {
        // Disconnected — queue for replay when partition heals
        this.outboundQueue.push(raw);
      }
    });
  }

  /**
   * Start the sync service for the given project root.
   * Reads proto.config.yaml to determine role and sync port.
   */
  async start(repoRoot: string): Promise<void> {
    if (this.started) {
      logger.warn('PeerMeshService already started, skipping');
      return;
    }

    // Load proto.config.yaml from repoRoot
    let protoConfig: Record<string, unknown> | null = null;
    try {
      protoConfig = (await loadProtoConfig(repoRoot)) as Record<string, unknown> | null;
    } catch (err) {
      logger.warn('[PeerMesh] Failed to load proto.config.yaml, using defaults:', err);
    }

    this.projectName = (protoConfig?.['name'] as string) || null;
    if (this.projectName) {
      logger.info(`[PeerMesh] Project name: ${this.projectName}`);
    } else {
      logger.warn(
        '[PeerMesh] No project name in proto.config.yaml — cross-project filtering disabled'
      );
    }

    const protolab = protoConfig?.['protolab'] as
      | { role?: string; syncPort?: number; instanceId?: string; instanceUrl?: string }
      | undefined;

    // Load instance profile (name, role, tags) from proto.config.yaml
    const instanceProfile = protoConfig?.['instance'] as
      | { name?: string; role?: string; tags?: string[] }
      | undefined;
    if (instanceProfile?.name) this.instanceName = instanceProfile.name;
    if (instanceProfile?.role) this.instanceRole = instanceProfile.role as InstanceRole;
    if (instanceProfile?.tags) this.instanceTags = instanceProfile.tags;

    this.role = (protolab?.role as SyncRole | undefined) ?? 'worker';
    this.syncPort = protolab?.syncPort ?? DEFAULT_SYNC_PORT;
    if (protolab?.instanceId) {
      this.instanceId = protolab.instanceId;
    }
    if (protolab?.instanceUrl) {
      this.instanceUrl = protolab.instanceUrl;
    }

    // Build a HivemindConfig from proto config or defaults
    const hivemind = protoConfig?.['hivemind'] as HivemindConfig | undefined;
    const meshEnabled =
      hivemind?.enabled ??
      (protoConfig?.['protolab'] as Record<string, unknown> | undefined)?.['enabled'] ??
      false;
    this.config = {
      enabled: Boolean(meshEnabled),
      role: this.role,
      syncPort: this.syncPort,
      instanceId: this.instanceId,
      instanceUrl: this.instanceUrl ?? undefined,
      heartbeatIntervalMs: hivemind?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS,
      peerTtlMs: hivemind?.peerTtlMs ?? DEFAULT_TTL_MS,
      peers: hivemind?.peers ?? [],
    };

    // Guard: if hivemind is not enabled, skip all mesh logic (no timers, no WebSocket server)
    if (!this.config.enabled) {
      logger.info(
        `[PeerMesh] hivemind.enabled=false — peer mesh is disabled. No WebSocket server, heartbeats, or peer connections will be started.`
      );
      this.started = true; // Mark as started so subsequent calls are no-ops
      return;
    }

    // Determine self priority from peers list
    const peers = this.config.peers ?? [];
    if (this.instanceUrl) {
      this.selfPriority = peers.indexOf(this.instanceUrl);
    }

    logger.info(
      `[PeerMesh] Starting as ${this.role} | instanceId=${this.instanceId} | syncPort=${this.syncPort} | priority=${this.selfPriority}`
    );

    if (this.role === 'primary') {
      await this._startServer();
    } else {
      this.primaryUrl = peers[0] ?? null;
      if (this.primaryUrl) {
        this._connectToPrimary(this.primaryUrl);
      } else {
        logger.warn('[PeerMesh] No primary URL configured — worker will not connect');
      }
    }

    this._startHeartbeat();
    this._startTtlCheck();
    this.started = true;
    logger.info(`[PeerMesh] Service started (role=${this.role})`);
  }

  /**
   * Gracefully shut down the sync service, announcing departure to peers.
   */
  async shutdown(): Promise<void> {
    if (!this.started) return;

    logger.info('[PeerMesh] Shutting down...');
    this._clearTimers();

    const goodbye: SyncMessage = {
      type: 'goodbye',
      instanceId: this.instanceId,
      timestamp: new Date().toISOString(),
    };
    const msg = JSON.stringify(goodbye);

    // Announce departure to all connected peers (server side)
    if (this.wsServer) {
      for (const client of this.wsServer.clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(msg);
          } catch {
            // Best effort
          }
          // Terminate connection so server.close() resolves immediately
          client.terminate();
        }
      }
      await new Promise<void>((resolve) => {
        this.wsServer!.close(() => resolve());
      });
      this.wsServer = null;
    }

    // Announce departure to primary (worker side)
    if (this.wsClient) {
      if (this.wsClient.readyState === WebSocket.OPEN) {
        try {
          this.wsClient.send(msg);
        } catch {
          // Best effort
        }
      }
      this.wsClient.terminate();
      this.wsClient = null;
    }

    // Kill any in-flight reconnect socket that hasn't been promoted to wsClient yet
    if (this.pendingWs) {
      this.pendingWs.terminate();
      this.pendingWs = null;
    }

    this.peers.clear();
    this.outboundQueue = [];
    this.partitionSince = null;
    this.started = false;
    logger.info('[PeerMesh] Shutdown complete');
  }

  /**
   * Returns the current sync status for the /health endpoint.
   * Includes peer capacity summaries so operators can see load across instances.
   */
  getSyncStatus(): SyncServerStatus {
    const onlinePeers = [...this.peers.values()]
      .filter((p) => p.identity.status === 'online')
      .map(({ ws: _ws, priority: _priority, ...peer }) => peer as HivemindPeer);

    const peerCapacitySummary = [...this.peers.values()]
      .filter((p) => p.identity.status === 'online')
      .map((p) => ({
        instanceId: p.identity.instanceId,
        runningAgents: p.identity.capacity.runningAgents,
        maxAgents: p.identity.capacity.maxAgents,
        backlogCount: p.identity.capacity.backlogCount,
        ramUsagePercent: p.identity.capacity.ramUsagePercent,
        cpuPercent: p.identity.capacity.cpuPercent,
      }));

    return {
      role: this.role,
      syncPort: this.role === 'primary' ? this.syncPort : null,
      connected:
        this.role === 'primary'
          ? this.wsServer !== null
          : this.wsClient?.readyState === WebSocket.OPEN,
      peerCount: this.peers.size,
      onlinePeers,
      isLeader: this.role === 'primary',
      peerCapacitySummary,
      partitionSince: this.partitionSince,
      queuedChanges: this.outboundQueue.length,
      compactionDiagnostics: null,
    };
  }

  /**
   * Returns all known peers (including offline).
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  getPeers(): HivemindPeer[] {
    return [...this.peers.values()].map(
      ({ ws: _ws, priority: _priority, ...peer }) => peer as HivemindPeer
    );
  }

  // ─── Private: Server (Primary) ───────────────────────────────────────────

  private async _startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({ port: this.syncPort });

      server.on('listening', () => {
        logger.info(`[PeerMesh] Primary sync server listening on port ${this.syncPort}`);
        this.wsServer = server;
        resolve();
      });

      server.on('error', (err) => {
        logger.error('[PeerMesh] Sync server error:', err);
        if (!this.wsServer) {
          reject(err);
        }
      });

      server.on('connection', (ws, req) => {
        const remoteAddr = req.socket.remoteAddress ?? 'unknown';
        logger.info(`[PeerMesh] New peer connected from ${remoteAddr}`);

        // Send our identity immediately
        const identity: SyncMessage = {
          type: 'identity',
          instanceId: this.instanceId,
          url: this.instanceUrl ?? undefined,
          timestamp: new Date().toISOString(),
          priority: 0,
        };
        ws.send(JSON.stringify(identity));

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString()) as SyncMessage;
            this._handleMessage(msg, ws);
          } catch {
            // Ignore malformed messages
          }
        });

        ws.on('close', () => {
          // Remove the peer associated with this socket
          for (const [id, peer] of this.peers.entries()) {
            if (peer.ws === ws) {
              peer.identity.status = 'offline';
              logger.info(`[PeerMesh] Peer ${id} disconnected`);
              break;
            }
          }
        });

        ws.on('error', (err) => {
          logger.warn('[PeerMesh] Peer WebSocket error:', err.message);
        });
      });
    });
  }

  // ─── Private: Client (Worker) ─────────────────────────────────────────────

  private _connectToPrimary(url: string): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const attemptConnect = (): void => {
      if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
        return; // Already connected
      }

      logger.info(`[PeerMesh] Connecting to primary at ${url}`);
      const ws = new WebSocket(url);
      this.pendingWs = ws;

      ws.on('open', () => {
        logger.info(`[PeerMesh] Connected to primary sync server at ${url}`);
        this.wsClient = ws;
        this.pendingWs = null;
        this.lastPrimaryContact = Date.now();
        this.promotionPending = false;

        // Stop reconnect polling
        if (this.reconnectTimer) {
          clearInterval(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Send our identity
        const identity: SyncMessage = {
          type: 'identity',
          instanceId: this.instanceId,
          url: this.instanceUrl ?? undefined,
          timestamp: new Date().toISOString(),
          priority: this.selfPriority >= 0 ? this.selfPriority : undefined,
        };
        ws.send(JSON.stringify(identity));
      });

      ws.on('message', (data) => {
        this.lastPrimaryContact = Date.now();
        try {
          const msg = JSON.parse(data.toString()) as SyncMessage;
          this._handleMessage(msg, ws);
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        if (this.wsClient === ws) {
          this.wsClient = null;
        }
        if (!this.started) return; // Shutting down

        if (!this.partitionSince) {
          this.partitionSince = new Date().toISOString();
          logger.warn(
            `[PeerMesh] Lost connection to primary — partition detected at ${this.partitionSince}`
          );
        }
        this._startReconnectLoop(url);
      });

      ws.on('error', (err) => {
        logger.warn(`[PeerMesh] Primary connection error: ${err.message}`);
        if (this.pendingWs === ws) this.pendingWs = null;
        if (this.wsClient === ws) this.wsClient = null;
        if (!this.started) return;
        if (!this.partitionSince) {
          this.partitionSince = new Date().toISOString();
          logger.warn(
            `[PeerMesh] Primary unreachable — partition detected at ${this.partitionSince}`
          );
        }
        this._startReconnectLoop(url);
      });
    };

    attemptConnect();
  }

  private _startReconnectLoop(url: string): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setInterval(() => {
      if (!this.started) {
        if (this.reconnectTimer) {
          clearInterval(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        return;
      }

      if (this.wsClient?.readyState === WebSocket.OPEN) {
        clearInterval(this.reconnectTimer!);
        this.reconnectTimer = null;
        return;
      }

      // Check if we've exceeded the TTL without primary contact → try to promote
      const ttl = this.config?.peerTtlMs ?? DEFAULT_TTL_MS;
      if (
        this.lastPrimaryContact !== null &&
        Date.now() - this.lastPrimaryContact > ttl &&
        !this.promotionPending
      ) {
        void this._tryPromote();
        return;
      }

      // Otherwise try to reconnect
      logger.info(`[PeerMesh] Attempting reconnect to ${url}`);
      const ws = new WebSocket(url);
      this.pendingWs = ws;
      ws.on('open', () => {
        logger.info(`[PeerMesh] Reconnected to primary at ${url}`);
        this.wsClient = ws;
        this.pendingWs = null;
        this.lastPrimaryContact = Date.now();
        this.promotionPending = false;
        clearInterval(this.reconnectTimer!);
        this.reconnectTimer = null;

        // Recover from partition: replay queued changes then clear partition state
        const partitionDuration = this.partitionSince
          ? Date.now() - new Date(this.partitionSince).getTime()
          : 0;
        if (this.outboundQueue.length > 0) {
          logger.info(
            `[PeerMesh] Partition recovered after ${partitionDuration}ms — replaying ${this.outboundQueue.length} queued changes`
          );
          for (const queued of this.outboundQueue) {
            try {
              ws.send(queued);
            } catch {
              // Best effort replay; dropped messages will be reconciled via CRDT sync
            }
          }
          this.outboundQueue = [];
        }
        if (this.partitionSince) {
          logger.info(
            `[PeerMesh] Partition cleared — was disconnected since ${this.partitionSince}`
          );
          this.partitionSince = null;
          // Emit audit event so feature loader can reconcile dual-claimed features
          if (this._eventBus) {
            this._eventBus.emit('sync:partition-recovered', {
              instanceId: this.instanceId,
              partitionDurationMs: partitionDuration,
            });
          }
        }

        const identity: SyncMessage = {
          type: 'identity',
          instanceId: this.instanceId,
          url: this.instanceUrl ?? undefined,
          timestamp: new Date().toISOString(),
          priority: this.selfPriority >= 0 ? this.selfPriority : undefined,
        };
        ws.send(JSON.stringify(identity));

        ws.on('message', (data) => {
          this.lastPrimaryContact = Date.now();
          try {
            const msg = JSON.parse(data.toString()) as SyncMessage;
            this._handleMessage(msg, ws);
          } catch {
            /* ignore malformed messages */
          }
        });
        ws.on('close', () => {
          if (this.wsClient === ws) {
            this.wsClient = null;
          }
          if (this.started) {
            if (!this.partitionSince) {
              this.partitionSince = new Date().toISOString();
              logger.warn(
                `[PeerMesh] Lost connection to primary — partition detected at ${this.partitionSince}`
              );
            }
            this._startReconnectLoop(url);
          }
        });
        ws.on('error', () => {
          if (this.wsClient === ws) this.wsClient = null;
          if (this.pendingWs === ws) this.pendingWs = null;
        });
      });
      ws.on('error', () => {
        if (this.pendingWs === ws) this.pendingWs = null;
        // Will retry on next interval tick
      });
    }, RECONNECT_INTERVAL_MS);
  }

  // ─── Private: Leader Election ─────────────────────────────────────────────

  /**
   * Promote this worker to primary if it has the highest priority among
   * reachable instances (lowest index in the peers list).
   */
  private async _tryPromote(): Promise<void> {
    if (this.promotionPending) return;

    const peers = this.config?.peers ?? [];
    // Determine if we are next in line (all higher-priority peers are offline)
    const ourPriority = this.selfPriority >= 0 ? this.selfPriority : peers.length;

    // Check if any lower-priority (closer to index 0) peer is online
    const hasHigherPriorityPeer = [...this.peers.values()].some((p) => {
      const pPriority = p.priority ?? peers.length;
      return pPriority < ourPriority && p.identity.status === 'online';
    });

    if (hasHigherPriorityPeer) {
      logger.info('[PeerMesh] Higher-priority peer is online, skipping promotion');
      return;
    }

    logger.info(
      `[PeerMesh] Primary unreachable and no higher-priority peers — promoting to primary`
    );
    this.promotionPending = true;

    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.role = 'primary';

    // Announce promotion to any known peers
    const promote: SyncMessage = {
      type: 'promote',
      instanceId: this.instanceId,
      url: this.instanceUrl ?? undefined,
      timestamp: new Date().toISOString(),
      priority: ourPriority,
    };
    // Broadcast to any currently connected workers (if there are any)
    this._broadcastToServer(JSON.stringify(promote));

    try {
      await this._startServer();
      logger.info('[PeerMesh] Successfully promoted to primary');
    } catch (err) {
      logger.error('[PeerMesh] Failed to start server during promotion:', err);
      this.role = 'worker';
    } finally {
      this.promotionPending = false;
    }
  }

  /** Build common peer message fields (instanceId, name, role, tags) */
  private _peerFields(): Pick<PeerMessage, 'instanceId' | 'name' | 'role' | 'tags'> {
    return {
      instanceId: this.instanceId,
      name: this.instanceName,
      role: this.instanceRole,
      tags: this.instanceTags,
    };
  }

  // ─── Private: Heartbeat ───────────────────────────────────────────────────

  private _startHeartbeat(): void {
    const intervalMs = this.config?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
    this.heartbeatTimer = setInterval(() => {
      const beat: SyncMessage = {
        type: 'heartbeat',
        ...this._peerFields(),
        url: this.instanceUrl ?? undefined,
        timestamp: new Date().toISOString(),
        capacity: this._capacityProvider ? this._capacityProvider() : undefined,
      };
      const msg = JSON.stringify(beat);

      if (this.role === 'primary') {
        this._broadcastToServer(msg);
      } else if (this.wsClient?.readyState === WebSocket.OPEN) {
        try {
          this.wsClient.send(msg);
        } catch {
          // Ignore send errors
        }
      }
    }, intervalMs);
  }

  private _broadcastToServer(msg: string): void {
    if (!this.wsServer) return;
    for (const client of this.wsServer.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch {
          // Ignore send errors
        }
      }
    }
  }

  /** Broadcast to all connected peers except the given sender socket. */
  private _broadcastToServerExcept(msg: string, except: WebSocket): void {
    if (!this.wsServer) return;
    for (const client of this.wsServer.clients) {
      if (client !== except && client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch {
          // Ignore send errors
        }
      }
    }
  }

  // ─── Private: TTL Check ───────────────────────────────────────────────────

  private _startTtlCheck(): void {
    this.ttlTimer = setInterval(() => {
      const ttl = this.config?.peerTtlMs ?? DEFAULT_TTL_MS;
      const now = Date.now();
      for (const [id, peer] of this.peers.entries()) {
        if (peer.identity.status === 'offline') continue;
        const lastSeen = new Date(peer.lastSeen).getTime();
        if (now - lastSeen > ttl) {
          logger.warn(
            `[PeerMesh] ALERT: Peer ${id} unreachable for >${ttl}ms (last seen ${peer.lastSeen}) — marking offline`
          );
          peer.identity.status = 'offline';
          if (this._eventBus) {
            this._eventBus.emit('sync:peer-unreachable', {
              instanceId: id,
              lastSeen: peer.lastSeen,
              peerTtlMs: ttl,
            });
          }
        }
      }
    }, TTL_CHECK_INTERVAL_MS);
  }

  // ─── Private: Message Handling ────────────────────────────────────────────

  private _handleMessage(msg: SyncMessage, ws: WebSocket): void {
    const now = new Date().toISOString();

    switch (msg.type) {
      case 'heartbeat': {
        this._upsertPeer(msg, ws, now);
        break;
      }
      case 'identity': {
        this._upsertPeer(msg, ws, now);
        // Primary broadcasts its CRDTStore registry to the newly connected peer
        // so the peer can adopt the primary's document URLs (prevents split-brain).
        if (this.role === 'primary' && this._registryProvider) {
          const registryMsg: CrdtRegistrySyncEvent = {
            type: 'registry_sync',
            instanceId: this.instanceId,
            registry: this._registryProvider(),
            timestamp: new Date().toISOString(),
          };
          try {
            ws.send(JSON.stringify(registryMsg));
            logger.info(
              `[PeerMesh] Sent registry sync to peer ${msg.instanceId} (${Object.keys(registryMsg.registry).length} entries)`
            );
          } catch {
            // Best effort
          }
        }
        break;
      }
      case 'goodbye': {
        const peer = this.peers.get(msg.instanceId);
        if (peer) {
          peer.identity.status = 'offline';
          logger.info(`[PeerMesh] Peer ${msg.instanceId} announced graceful departure`);
        }
        break;
      }
      case 'promote': {
        logger.info(`[PeerMesh] Instance ${msg.instanceId} has promoted to primary`);
        // Update primary URL if we're a worker
        if (this.role === 'worker' && msg.url) {
          this.primaryUrl = msg.url;
          if (this.wsClient) {
            this.wsClient.close();
          }
          this._connectToPrimary(msg.url);
        }
        break;
      }
      case 'feature_event': {
        // Ignore events originating from this instance (shouldn't happen in normal flow
        // since we only send to peers, but guard against misconfigured loops).
        if (msg.instanceId === this.instanceId) break;
        if (!this._eventBus) break;

        // Reject events from foreign projects to prevent cross-project contamination.
        // If the sender includes a projectName and it doesn't match ours, drop the event.
        if (this.projectName && msg.projectName && msg.projectName !== this.projectName) {
          logger.warn(
            `[PeerMesh] Rejecting feature event from foreign project "${msg.projectName}" (local: "${this.projectName}")`,
            { eventType: msg.eventType, instanceId: msg.instanceId }
          );
          break;
        }

        logger.info(
          `[PeerMesh] Received remote feature event: ${msg.eventType} from ${msg.instanceId}`
        );

        // Persist the remote feature change locally before emitting.
        if (this._remoteFeatureCallback) {
          try {
            this._remoteFeatureCallback(msg.eventType, msg.payload as Record<string, unknown>);
          } catch (err) {
            logger.error(`[PeerMesh] Error persisting remote feature event: ${err}`);
          }
        }

        // Use emit() NOT broadcast() to avoid re-publishing to peers.
        this._eventBus.emit(msg.eventType, msg.payload);

        // Primary relays feature events to all other connected workers.
        if (this.role === 'primary') {
          this._broadcastToServerExcept(JSON.stringify(msg), ws);
        }
        break;
      }
      case 'registry_sync': {
        if (msg.instanceId === this.instanceId) break;
        logger.info(
          `[PeerMesh] Received registry sync from ${msg.instanceId} (${Object.keys(msg.registry).length} entries)`
        );
        if (this._registryReceivedCallback) {
          this._registryReceivedCallback(msg.registry);
        }
        break;
      }
      case 'settings_event': {
        // Ignore settings from this instance to prevent feedback loops.
        if (msg.instanceId === this.instanceId) break;

        logger.debug(`[PeerMesh] Received remote settings update from ${msg.instanceId}`);

        if (this._settingsCallback) {
          this._settingsCallback(msg.settings);
        }

        // Primary relays settings events to all other connected workers.
        if (this.role === 'primary') {
          this._broadcastToServerExcept(JSON.stringify(msg), ws);
        }
        break;
      }
    }
  }

  private _upsertPeer(msg: PeerMessage, ws: WebSocket, now: string): void {
    const existing = this.peers.get(msg.instanceId);
    if (existing) {
      existing.lastSeen = now;
      existing.identity.lastHeartbeat = msg.timestamp;
      existing.identity.status = 'online';
      if (msg.url) existing.identity.url = msg.url;
      if (msg.capacity) existing.identity.capacity = msg.capacity;
      if (msg.name) existing.identity.name = msg.name;
      if (msg.role) existing.identity.role = msg.role;
      if (msg.tags) existing.identity.tags = msg.tags;
    } else {
      this.peers.set(msg.instanceId, {
        identity: {
          instanceId: msg.instanceId,
          name: msg.name,
          role: msg.role,
          tags: msg.tags,
          url: msg.url,
          capacity: msg.capacity ?? {
            cores: 0,
            ramMb: 0,
            maxAgents: 0,
            runningAgents: 0,
            backlogCount: 0,
            ramUsagePercent: 0,
            cpuPercent: 0,
          },
          domains: [],
          lastHeartbeat: msg.timestamp,
          status: 'online',
        },
        lastSeen: now,
        ws,
        priority: msg.priority,
      });
    }
  }

  // ─── Private: Timer Cleanup ───────────────────────────────────────────────

  private _clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ttlTimer) {
      clearInterval(this.ttlTimer);
      this.ttlTimer = null;
    }
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
