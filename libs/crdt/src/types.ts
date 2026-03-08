/**
 * Core types for @protolabsai/crdt
 *
 * Every CRDT document root includes schemaVersion (integer, starting at 1)
 * and attribution metadata (_meta) for auditability.
 */

import type { DocHandle } from '@automerge/automerge-repo';

/**
 * Attribution metadata included in every CRDT document operation.
 * Satisfies the requirement: "All CRDT operations include instanceId
 * and timestamp for attribution and auditability."
 */
export interface DocumentMeta {
  instanceId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Base interface that every CRDT document root must extend.
 * schemaVersion starts at 1 and increments on breaking schema changes.
 */
export interface CRDTDocumentRoot {
  schemaVersion: number;
  _meta: DocumentMeta;
}

/**
 * Supported domain namespaces for grouping CRDT documents.
 */
export type DomainName =
  | 'features'
  | 'projects'
  | 'config'
  | 'settings'
  | 'capacity'
  | 'ava-channel'
  | 'calendar'
  | 'todos'
  | 'metrics';

/**
 * Configuration for a WebSocket sync peer (typically a Tailscale peer).
 * url format: ws://100.x.x.x:PORT
 */
export interface SyncPeerConfig {
  url: string;
}

/**
 * Configuration for CRDTStore initialization.
 */
export interface CRDTStoreConfig {
  /** Directory where CRDT data is persisted (e.g. .automaker/crdt/) */
  storageDir: string;
  /** Unique identifier for this node — included in all CRDT operations */
  instanceId: string;
  /** Tailscale peers to connect to for real-time sync */
  peers?: SyncPeerConfig[];
  /** Interval in ms for periodic compaction checkpoints. Default: 5 minutes */
  compactIntervalMs?: number;
}

/**
 * Callback invoked when a CRDT document changes (local or remote).
 */
export type ChangeCallback<T extends CRDTDocumentRoot> = (doc: Readonly<T>) => void;

/**
 * Returns a function that removes the subscription when called.
 */
export type Unsubscribe = () => void;

/**
 * Context provided to the hydration function for creating documents.
 */
export interface HydrationContext {
  createDocument<T extends CRDTDocumentRoot>(
    domain: DomainName,
    id: string,
    initialDoc: Omit<T, 'schemaVersion' | '_meta'>
  ): Promise<void>;
}

/**
 * One-time hydration function called on first startup when CRDT storage is empty
 * but the filesystem has existing features/projects. Runs once, then never again.
 */
export type HydrationFn = (ctx: HydrationContext) => Promise<void>;

/**
 * Internal registry mapping (domain:id) -> AutomergeUrl.
 * Persisted to storageDir/registry.json.
 */
export type RegistryMap = Record<string, string>;

/**
 * Schema normalizer: given a raw document (possibly old schema), returns
 * a corrected version. Same pattern as FeatureLoader legacy status normalization.
 */
export type SchemaNormalizer<T extends CRDTDocumentRoot> = (doc: Partial<T>) => T;

/**
 * Re-export DocHandle for consumers.
 */
export type { DocHandle };
