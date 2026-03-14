/**
 * Hivemind types — multi-instance mesh coordination.
 *
 * These types define instance identity, domain ownership, and peer
 * discovery for the hivemind distributed architecture.
 */

/** Role of an instance in the sync mesh */
export type SyncRole = 'primary' | 'worker';

/** Compact capacity summary for a single peer — used in /health responses */
export interface PeerCapacitySummary {
  instanceId: string;
  runningAgents: number;
  maxAgents: number;
  backlogCount: number;
  ramUsagePercent: number;
  cpuPercent: number;
}

/** Health status of the peer mesh sync service for the /health endpoint */
export interface SyncServerStatus {
  /** This instance's current role */
  role: SyncRole;
  /** Port the sync server is listening on (primary only) */
  syncPort: number | null;
  /** Whether connected to the sync mesh (server running or client connected) */
  connected: boolean;
  /** Number of known peers */
  peerCount: number;
  /** Currently online peers */
  onlinePeers: HivemindPeer[];
  /** Whether this instance is currently acting as the leader/primary */
  isLeader: boolean;
  /** Compact capacity snapshot for each online peer */
  peerCapacitySummary?: PeerCapacitySummary[];
  /**
   * ISO timestamp when this instance last lost sync connectivity (network partition).
   * null means the instance is currently connected (or was never disconnected).
   */
  partitionSince: string | null;
  /** Number of local event changes queued while disconnected from the sync mesh */
  queuedChanges: number;
  /** Reserved for future diagnostics; always null */
  compactionDiagnostics: null;
}

/** Capacity metrics for an instance */
export interface InstanceCapacity {
  cores: number;
  ramMb: number;
  maxAgents: number;
  runningAgents: number;
  /** Number of features in backlog status across all active projects */
  backlogCount: number;
  /** System RAM usage as a percentage (0-100) */
  ramUsagePercent: number;
  /** CPU load as a percentage (0-100), derived from 1-minute load average */
  cpuPercent: number;
}

/** A domain is a set of codebase paths owned by an instance */
export interface HivemindDomain {
  /** Human-readable domain name (e.g. "frontend", "server", "flows") */
  name: string;
  /** Codebase paths this domain covers (e.g. ["apps/ui/", "apps/ui/tests/"]) */
  paths: string[];
  /** Instance that owns this domain, or undefined if unassigned */
  instanceId?: string;
}

/** Identity and state of a single Automaker instance in the mesh */
export interface InstanceIdentity {
  /** Unique instance identifier (defaults to os.hostname()) */
  instanceId: string;
  /** Human-readable display name (from proto.config.yaml instance.name) */
  name?: string;
  /** Primary work focus role (from proto.config.yaml instance.role) */
  role?: import('./proto-config.js').InstanceRole;
  /** Additional capability tags (from proto.config.yaml instance.tags) */
  tags?: string[];
  /** URL where this instance's API is reachable */
  url?: string;
  /** Current capacity metrics */
  capacity: InstanceCapacity;
  /** Domains this instance owns */
  domains: HivemindDomain[];
  /** ISO timestamp of last heartbeat */
  lastHeartbeat?: string;
  /** Instance status */
  status?: 'online' | 'offline' | 'draining';
}

/** Peer info as seen by another instance */
export interface HivemindPeer {
  /** The peer's identity */
  identity: InstanceIdentity;
  /** When we last heard from this peer */
  lastSeen: string;
  /** Latency to this peer in ms (from last heartbeat) */
  latencyMs?: number;
}

/** Configuration for hivemind mesh participation */
export interface HivemindConfig {
  /** Whether hivemind is enabled for this instance */
  enabled: boolean;
  /** Role of this instance in the sync mesh (default: worker) */
  role?: SyncRole;
  /** Port to start the sync WebSocket server on (primary only) */
  syncPort?: number;
  /** Unique instance identifier (defaults to os.hostname()) */
  instanceId?: string;
  /** URL where this instance's sync server is reachable (e.g. ws://host:4444) */
  instanceUrl?: string;
  /** Shared hive identifier — instances must match to join */
  hiveId?: string;
  /** Hashed passphrase for hive membership auth */
  secret?: string;
  /** Peer URLs in priority order — index 0 is preferred primary */
  peers?: string[];
  /** Domains owned by this instance */
  domains?: HivemindDomain[];
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatIntervalMs?: number;
  /** Peer TTL in ms — mark offline after this (default: 120000) */
  peerTtlMs?: number;
}
