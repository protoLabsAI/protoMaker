/**
 * Domain document schemas and schema-on-read normalizers.
 *
 * Every domain document includes schemaVersion (starting at 1) and _meta for
 * attribution. Normalizers run on document load to handle legacy field migrations,
 * following the same pattern as FeatureLoader legacy status normalization.
 */

import type { CRDTDocumentRoot, SchemaNormalizer } from './types.js';
import type { CalendarEvent, TodoList } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Feature domain
// ---------------------------------------------------------------------------

export interface FeatureDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  status: string;
  complexity?: string;
  createdAt: string;
}

export const normalizeFeatureDocument: SchemaNormalizer<FeatureDocument> = (raw) => {
  const doc = raw as Partial<FeatureDocument>;

  let schemaVersion = doc.schemaVersion ?? 1;
  if (typeof schemaVersion !== 'number' || schemaVersion < 1) {
    schemaVersion = 1;
  }

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let status = doc.status ?? 'backlog';
  // Normalize legacy statuses (same pattern as FeatureLoader)
  if (status === 'pending' || status === 'ready') status = 'backlog';
  if (status === 'running') status = 'in_progress';
  if (status === 'completed' || status === 'verified' || status === 'waiting_approval')
    status = 'done';
  if (status === 'failed') status = 'blocked';

  return {
    schemaVersion: 1,
    _meta,
    id: doc.id ?? '',
    title: doc.title ?? '',
    description: doc.description ?? '',
    status,
    complexity: doc.complexity,
    createdAt: doc.createdAt ?? _meta.createdAt,
  };
};

// ---------------------------------------------------------------------------
// Project domain
// ---------------------------------------------------------------------------

export interface ProjectDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  id: string;
  title: string;
  goal: string;
  status: string;
  /** PRD markdown content — stored as a plain string for Automerge sync */
  prd: string;
  /** Number of milestones — denormalized for quick reads */
  milestoneCount: number;
  createdAt: string;
}

export const normalizeProjectDocument: SchemaNormalizer<ProjectDocument> = (raw) => {
  const doc = raw as Partial<ProjectDocument>;

  const schemaVersion =
    typeof doc.schemaVersion === 'number' && doc.schemaVersion >= 1 ? doc.schemaVersion : 1;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let status = doc.status ?? 'researching';
  // Normalize legacy statuses
  if (status === 'draft') status = 'drafting';
  if (status === 'complete') status = 'completed';

  return {
    schemaVersion: 1 as const,
    _meta,
    id: doc.id ?? '',
    title: doc.title ?? '',
    goal: doc.goal ?? '',
    status,
    prd: doc.prd ?? '',
    milestoneCount: doc.milestoneCount ?? 0,
    createdAt: doc.createdAt ?? _meta.createdAt,
  };
};

// ---------------------------------------------------------------------------
// Config domain
// ---------------------------------------------------------------------------

export interface ConfigDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  key: string;
  value: unknown;
  updatedAt: string;
}

export const normalizeConfigDocument: SchemaNormalizer<ConfigDocument> = (raw) => {
  const doc = raw as Partial<ConfigDocument>;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    schemaVersion: 1,
    _meta,
    key: doc.key ?? '',
    value: doc.value ?? null,
    updatedAt: doc.updatedAt ?? _meta.updatedAt,
  };
};

// ---------------------------------------------------------------------------
// SharedSettings domain
// ---------------------------------------------------------------------------

/**
 * SharedSettingsDocument stores settings that should propagate across
 * all instances in a hive. Credentials and API keys MUST NOT be included.
 *
 * Resolution order (lowest → highest priority):
 *   proto.config defaults < shared CRDT settings < local .automaker/settings.json
 *
 * Use document id="shared" within the 'settings' domain.
 */
export interface SharedSettingsDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  /**
   * Shared settings payload. Keys map to project settings fields that are
   * safe to propagate: phaseModelOverrides, maxConcurrency, workflow tuning.
   * Credentials, API keys, and UI-only preferences are excluded.
   */
  settings: Record<string, unknown>;
  updatedAt: string;
}

export const normalizeSharedSettingsDocument: SchemaNormalizer<SharedSettingsDocument> = (raw) => {
  const doc = raw as Partial<SharedSettingsDocument>;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    schemaVersion: 1,
    _meta,
    settings: doc.settings ?? {},
    updatedAt: doc.updatedAt ?? _meta.updatedAt,
  };
};

// ---------------------------------------------------------------------------
// Capacity domain
// ---------------------------------------------------------------------------

/**
 * CapacityDocument stores per-instance capacity metrics in the shared CRDT
 * assignments document. Each instance publishes its own capacity snapshot
 * keyed by instanceId. Used by the work-stealing protocol to identify idle
 * and busy peers.
 *
 * Use domain='capacity', document id=instanceId.
 */
export interface CapacityDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  /** Instance that owns this capacity record */
  instanceId: string;
  /** Number of agents currently running on this instance */
  runningAgents: number;
  /** Maximum agents this instance is configured to run concurrently */
  maxAgents: number;
  /** Number of features in backlog status across all active projects */
  backlogCount: number;
  /** System RAM usage as a percentage (0-100) */
  ramUsagePercent: number;
  /** CPU load as a percentage (0-100) */
  cpuPercent: number;
  /** ISO timestamp of last update */
  updatedAt: string;
}

export const normalizeCapacityDocument: SchemaNormalizer<CapacityDocument> = (raw) => {
  const doc = raw as Partial<CapacityDocument>;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    schemaVersion: 1,
    _meta,
    instanceId: doc.instanceId ?? _meta.instanceId,
    runningAgents: doc.runningAgents ?? 0,
    maxAgents: doc.maxAgents ?? 0,
    backlogCount: doc.backlogCount ?? 0,
    ramUsagePercent: doc.ramUsagePercent ?? 0,
    cpuPercent: doc.cpuPercent ?? 0,
    updatedAt: doc.updatedAt ?? _meta.updatedAt,
  };
};

// ---------------------------------------------------------------------------
// Ava Channel domain
// ---------------------------------------------------------------------------

/**
 * AvaChannelDocument stores a single daily shard of Ava Channel messages.
 *
 * The messages array is an append-only grow-only list CRDT. No edits or
 * deletes are permitted — content is the protocol.
 *
 * Use domain='ava-channel', document id=YYYY-MM-DD date string.
 * Full document key: doc:ava-channel/YYYY-MM-DD
 */
export interface AvaChannelDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  messages: Array<{
    id: string;
    instanceId: string;
    instanceName: string;
    content: string;
    context?: {
      featureId?: string;
      boardSummary?: string;
      capacity?: {
        runningAgents: number;
        maxAgents: number;
        backlogCount: number;
      };
    };
    source: 'ava' | 'operator' | 'system';
    timestamp: string;
  }>;
}

export const normalizeAvaChannelDocument: SchemaNormalizer<AvaChannelDocument> = (raw) => {
  const doc = raw as Partial<AvaChannelDocument>;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    schemaVersion: 1,
    _meta,
    messages: doc.messages ?? [],
  };
};

// ---------------------------------------------------------------------------
// Calendar domain — shared global event store
// ---------------------------------------------------------------------------

/**
 * CalendarDocument stores all calendar events in a single shared CRDT document.
 * Events are keyed by their ID for conflict-free merge semantics — last writer wins
 * per event, and events from different instances merge without conflict.
 *
 * Use domain='calendar', document id='shared' for the global calendar.
 * Any instance can create/edit/delete events; changes propagate to all peers.
 */
export interface CalendarDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  /** Calendar events stored by event ID for efficient CRDT map merge */
  events: Record<string, CalendarEvent>;
  /** ISO timestamp of last update to this document */
  updatedAt: string;
}

export const normalizeCalendarDocument: SchemaNormalizer<CalendarDocument> = (raw) => {
  const doc = raw as Partial<CalendarDocument>;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    schemaVersion: 1,
    _meta,
    events: doc.events ?? {},
    updatedAt: doc.updatedAt ?? _meta.updatedAt,
  };
};

// ---------------------------------------------------------------------------
// Todos domain — multi-tier permission workspace
// ---------------------------------------------------------------------------

/**
 * TodosDocument stores the shared todo workspace in a single CRDT document.
 *
 * Permission tiers (enforced at the service layer, not CRDT layer):
 *   (1) user lists (ownerType='user') — user read/write, all Avas read-only
 *   (2) ava-instance lists (ownerType='ava-instance') — writable by owning
 *       instance's Ava + user; readable by all Avas on all instances
 *   (3) shared lists (ownerType='shared') — full read/write by anyone
 *
 * Use domain='todos', document id='workspace' for the single shared workspace.
 * Full document key: doc:todos/workspace
 */
export interface TodosDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  /** All todo lists keyed by list ID */
  lists: Record<string, TodoList>;
  /** Ordered array of list IDs */
  listOrder: string[];
  /** ISO timestamp of last update to this document */
  updatedAt: string;
}

export const normalizeTodosDocument: SchemaNormalizer<TodosDocument> = (raw) => {
  const doc = raw as Partial<TodosDocument>;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Normalize lists — ensure each list has valid ownerType
  const rawLists = doc.lists ?? {};
  const lists: Record<string, TodoList> = {};
  for (const [id, list] of Object.entries(rawLists)) {
    if (!list) continue;
    lists[id] = {
      ...list,
      ownerType: list.ownerType ?? 'shared',
      items: Array.isArray(list.items) ? list.items : [],
    };
  }

  return {
    schemaVersion: 1,
    _meta,
    lists,
    listOrder: Array.isArray(doc.listOrder) ? doc.listOrder : Object.keys(lists),
    updatedAt: doc.updatedAt ?? _meta.updatedAt,
  };
};

// ---------------------------------------------------------------------------
// Normalizer registry
// ---------------------------------------------------------------------------

type AnyDocument =
  | FeatureDocument
  | ProjectDocument
  | ConfigDocument
  | SharedSettingsDocument
  | CapacityDocument
  | AvaChannelDocument
  | CalendarDocument
  | TodosDocument;

const NORMALIZERS: Record<string, SchemaNormalizer<AnyDocument>> = {
  features: normalizeFeatureDocument as SchemaNormalizer<AnyDocument>,
  projects: normalizeProjectDocument as SchemaNormalizer<AnyDocument>,
  config: normalizeConfigDocument as SchemaNormalizer<AnyDocument>,
  settings: normalizeSharedSettingsDocument as SchemaNormalizer<AnyDocument>,
  capacity: normalizeCapacityDocument as SchemaNormalizer<AnyDocument>,
  'ava-channel': normalizeAvaChannelDocument as SchemaNormalizer<AnyDocument>,
  calendar: normalizeCalendarDocument as SchemaNormalizer<AnyDocument>,
  todos: normalizeTodosDocument as SchemaNormalizer<AnyDocument>,
};

/**
 * Run the schema-on-read normalizer for a given domain.
 * Returns the raw doc unchanged if no normalizer is registered.
 */
export function normalizeDocument<T extends CRDTDocumentRoot>(domain: string, raw: Partial<T>): T {
  const normalizer = NORMALIZERS[domain] as unknown as SchemaNormalizer<T> | undefined;
  if (!normalizer) {
    return raw as T;
  }
  return normalizer(raw);
}
