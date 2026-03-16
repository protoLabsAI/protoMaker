/**
 * @protolabsai/context-engine
 *
 * DAG-based context engine for intelligent conversation context management.
 *
 * Exports:
 * - Core types (Message, Summary, SummaryNode, ContextItem, etc.)
 * - CompactionConfig and its defaults
 * - AssemblyResult
 * - ContextEngine interface and related option types
 * - SummaryStore — SQLite-backed DAG persistence
 * - Migration helpers (migrations.ts)
 */

// Types
export type {
  AssemblyResult,
  CompactionConfig,
  ContextItem,
  Message,
  MessageId,
  SessionId,
  Summary,
  SummaryNode,
  SummaryNodeId,
} from './types.js';

export { DEFAULT_COMPACTION_CONFIG } from './types.js';

// Engine interface and option types
export type { AssembleOptions, CompactOptions, ContextEngine, RetrieveOptions } from './engine.js';

// Store
export { SummaryStore } from './store/summary-store.js';
export type { ContextItemRow, FtsSearchResult } from './store/summary-store.js';

export { runMigrations } from './store/migrations.js';
export type { Migration } from './store/migrations.js';
export { MIGRATIONS } from './store/migrations.js';
