/**
 * @protolabsai/crdt
 *
 * CRDT document store wrapping Automerge 3 + automerge-repo.
 * Manages documents by domain (features, projects, config) with persistence,
 * WebSocket sync, schema-on-read normalization, and periodic compaction.
 */

export { CRDTStore } from './crdt-store.js';

export { createSyncClientAdapter, WebSocketServerAdapter } from './sync-adapter.js';

export {
  normalizeDocument,
  normalizeFeatureDocument,
  normalizeProjectDocument,
  normalizeConfigDocument,
  normalizeSharedSettingsDocument,
} from './documents.js';

export type {
  FeatureDocument,
  ProjectDocument,
  ConfigDocument,
  SharedSettingsDocument,
} from './documents.js';

export type {
  CRDTDocumentRoot,
  CRDTStoreConfig,
  ChangeCallback,
  DomainName,
  DocumentMeta,
  HydrationFn,
  HydrationContext,
  RegistryMap,
  SchemaNormalizer,
  SyncPeerConfig,
  Unsubscribe,
  DocHandle,
} from './types.js';

export { MaintenanceTracker } from './maintenance.js';
export type { CompactionRecord, CompactionAlert, CompactionDiagnostics } from './maintenance.js';
