/**
 * Hivemind types — multi-instance mesh coordination.
 *
 * These types define instance identity, domain ownership, and peer
 * discovery for the hivemind distributed architecture.
 */

/** Capacity metrics for an instance */
export interface InstanceCapacity {
  cores: number;
  ramMb: number;
  maxAgents: number;
  runningAgents: number;
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
  /** Shared hive identifier — instances must match to join */
  hiveId?: string;
  /** Hashed passphrase for hive membership auth */
  secret?: string;
  /** Peer URLs for manual join (before auto-discovery) */
  peers?: string[];
  /** Domains owned by this instance */
  domains?: HivemindDomain[];
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatIntervalMs?: number;
  /** Peer TTL in ms — mark offline after this (default: 120000) */
  peerTtlMs?: number;
}
