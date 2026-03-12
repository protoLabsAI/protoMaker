/**
 * Domain document schemas and schema-on-read normalizers.
 *
 * Every domain document includes schemaVersion (starting at 1) and _meta for
 * attribution. Normalizers run on document load to handle legacy field migrations,
 * following the same pattern as FeatureLoader legacy status normalization.
 */

import type { CRDTDocumentRoot, SchemaNormalizer } from './types.js';
import type {
  CadenceConfig,
  CalendarEvent,
  Milestone,
  PRDReviewComment,
  ProjectHealth,
  ProjectLink,
  ProjectPriority,
  ProjectStatus,
  ProjectStatusUpdate,
  SPARCPrd,
  TodoList,
} from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Project domain
// ---------------------------------------------------------------------------

/**
 * ProjectDocument mirrors the full Project type for CRDT sync.
 *
 * Schema evolution notes:
 *   v1 (legacy thin): {id, title, goal, status, prd: string, milestoneCount}
 *   v1 (current full): all Project fields; normalizer handles legacy docs on read
 */
export interface ProjectDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  id: string;
  title: string;
  goal: string;
  description?: string;
  lead?: string;
  members?: string[];
  startDate?: string;
  targetDate?: string;
  health?: ProjectHealth;
  priority?: ProjectPriority;
  color?: string;
  type?: 'finite' | 'ongoing';
  /** @deprecated Use `type` instead */
  ongoing?: boolean;
  /** Instance ID or agent name this project is assigned to */
  assignedTo?: string;
  /** ISO 8601 timestamp when the project was assigned */
  assignedAt?: string;
  /** Who performed the assignment */
  assignedBy?: string;
  /** External links */
  links?: ProjectLink[];
  /** Status update timeline */
  updates?: ProjectStatusUpdate[];
  status: ProjectStatus;
  /** Milestones with phases and claim fields */
  milestones: Milestone[];
  /** Research summary from deep research agent */
  researchSummary?: string;
  /** SPARC PRD content (replaces legacy plain-string prd) */
  prd?: SPARCPrd;
  /** PRD review comments */
  reviewComments?: PRDReviewComment[];
  /** Feedback from last "request changes" review */
  reviewFeedback?: string;
  /** Ceremony cadence configuration */
  cadence?: CadenceConfig;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

/** Legacy thin doc shape written by old instances */
type LegacyProjectDoc = Partial<ProjectDocument> & {
  /** Old plain-string PRD field */
  prd?: string | SPARCPrd;
  /** Old denormalized milestone count */
  milestoneCount?: number;
};

export const normalizeProjectDocument: SchemaNormalizer<ProjectDocument> = (raw) => {
  const doc = raw as LegacyProjectDoc;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let status = (doc.status ?? 'researching') as string;
  // Normalize legacy statuses
  if (status === 'draft') status = 'drafting';
  if (status === 'complete') status = 'completed';

  // Normalize prd: legacy plain string → SPARCPrd object
  let prd: SPARCPrd | undefined;
  if (typeof doc.prd === 'string' && doc.prd) {
    prd = {
      situation: '',
      problem: '',
      approach: doc.prd,
      results: '',
      constraints: '',
      generatedAt: _meta.createdAt,
    };
  } else if (doc.prd && typeof doc.prd === 'object') {
    prd = doc.prd as SPARCPrd;
  }

  // Normalize milestones: default missing array to [] and ensure phase claim fields
  const milestones: Milestone[] = (Array.isArray(doc.milestones) ? doc.milestones : []).map(
    (m) => ({
      ...m,
      phases: (Array.isArray(m.phases) ? m.phases : []).map((p) => ({
        ...p,
        executionStatus: p.executionStatus ?? 'unclaimed',
      })),
    })
  );

  return {
    schemaVersion: 1 as const,
    _meta,
    id: doc.id ?? '',
    title: doc.title ?? '',
    goal: doc.goal ?? '',
    description: doc.description,
    lead: doc.lead,
    members: doc.members,
    startDate: doc.startDate,
    targetDate: doc.targetDate,
    health: doc.health,
    priority: doc.priority,
    color: doc.color,
    type: doc.type,
    ongoing: doc.ongoing,
    assignedTo: doc.assignedTo,
    assignedAt: doc.assignedAt,
    assignedBy: doc.assignedBy,
    links: doc.links,
    updates: doc.updates,
    status: status as ProjectStatus,
    milestones,
    researchSummary: doc.researchSummary,
    prd,
    reviewComments: doc.reviewComments,
    reviewFeedback: doc.reviewFeedback,
    cadence: doc.cadence,
    createdAt: doc.createdAt ?? _meta.createdAt,
    updatedAt: doc.updatedAt ?? _meta.updatedAt,
    archivedAt: doc.archivedAt,
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
// Metrics domain — aggregate DORA metrics and instance reports
// ---------------------------------------------------------------------------

/**
 * Per-file memory usage statistics for a single instance.
 * Mirrors UsageStats from @protolabsai/utils but is kept local to avoid
 * a circular package dependency.
 */
export interface MemoryUsageStat {
  loaded: number;
  referenced: number;
  successfulFeatures: number;
}

/**
 * MetricsDocument stores aggregated DORA metrics across all instances.
 *
 * Use domain='metrics', document id='dora' for the aggregate DORA store.
 * Each instance contributes its DoraReport via the reactor's dora_report handler.
 */
export interface MetricsDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  /** Per-instance DORA report snapshots, keyed by instanceId */
  instanceReports: Record<
    string,
    {
      computedAt: string;
      deploymentsLast24h: number;
      avgLeadTimeMs: number;
      blockedCount: number;
      doneCount: number;
    }
  >;
  /**
   * Per-instance memory file usage stats.
   * Outer key: instanceId. Inner key: filename (basename, e.g. "gotchas.md").
   * Each instance writes only to its own instanceId key.
   * Read path: aggregate across all instanceId keys to get total usage counts.
   */
  memoryStats: Record<string, Record<string, MemoryUsageStat>>;
  /** ISO timestamp of last aggregate update */
  updatedAt: string;
}

export const normalizeMetricsDocument: SchemaNormalizer<MetricsDocument> = (raw) => {
  const doc = raw as Partial<MetricsDocument>;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    schemaVersion: 1,
    _meta,
    instanceReports: doc.instanceReports ?? {},
    memoryStats: doc.memoryStats ?? {},
    updatedAt: doc.updatedAt ?? _meta.updatedAt,
  };
};

// ---------------------------------------------------------------------------
// Notes domain — shared notes workspace
// ---------------------------------------------------------------------------

/**
 * NoteTab represents a single tab in the notes workspace.
 * Content is HTML produced by TipTap.
 */
export interface NoteTab {
  id: string;
  name: string;
  /** HTML content from TipTap editor */
  content: string;
  permissions: {
    agentRead: boolean;
    agentWrite: boolean;
  };
  /** ISO 8601 timestamp */
  createdAt: string;
  /** ISO 8601 timestamp */
  updatedAt: string;
  wordCount: number;
  characterCount: number;
}

/**
 * NotesWorkspaceDocument stores the shared notes workspace in a single CRDT document.
 * Schema mirrors the existing disk format at .automaker/notes/workspace.json.
 *
 * Use domain='notes', document id='workspace' for the single shared workspace.
 * Full document key: doc:notes/workspace
 */
export interface NotesWorkspaceDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  /** All note tabs keyed by tab ID */
  tabs: Record<string, NoteTab>;
  /** Ordered array of tab IDs */
  tabOrder: string[];
  /** Currently active tab ID, or null if none */
  activeTabId: string | null;
  /** ISO timestamp of last update to this document */
  updatedAt: string;
}

export const normalizeNotesWorkspace: SchemaNormalizer<NotesWorkspaceDocument> = (raw) => {
  const doc = raw as Partial<NotesWorkspaceDocument>;

  const _meta = doc._meta ?? {
    instanceId: 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Normalize tabs — ensure each tab has all required fields
  const rawTabs = doc.tabs ?? {};
  const tabs: Record<string, NoteTab> = {};
  for (const [id, tab] of Object.entries(rawTabs)) {
    if (!tab) continue;
    tabs[id] = {
      id: tab.id ?? id,
      name: tab.name ?? '',
      content: tab.content ?? '',
      permissions: {
        agentRead: tab.permissions?.agentRead ?? true,
        agentWrite: tab.permissions?.agentWrite ?? false,
      },
      createdAt: tab.createdAt ?? _meta.createdAt,
      updatedAt: tab.updatedAt ?? _meta.updatedAt,
      wordCount: tab.wordCount ?? 0,
      characterCount: tab.characterCount ?? 0,
    };
  }

  return {
    schemaVersion: 1,
    _meta,
    tabs,
    tabOrder: Array.isArray(doc.tabOrder) ? doc.tabOrder : Object.keys(tabs),
    activeTabId: doc.activeTabId !== undefined ? doc.activeTabId : null,
    updatedAt: doc.updatedAt ?? _meta.updatedAt,
  };
};

// ---------------------------------------------------------------------------
// Normalizer registry
// ---------------------------------------------------------------------------

type AnyDocument =
  | ProjectDocument
  | SharedSettingsDocument
  | CapacityDocument
  | AvaChannelDocument
  | CalendarDocument
  | TodosDocument
  | MetricsDocument
  | NotesWorkspaceDocument;

const NORMALIZERS: Record<string, SchemaNormalizer<AnyDocument>> = {
  projects: normalizeProjectDocument as SchemaNormalizer<AnyDocument>,
  settings: normalizeSharedSettingsDocument as SchemaNormalizer<AnyDocument>,
  capacity: normalizeCapacityDocument as SchemaNormalizer<AnyDocument>,
  'ava-channel': normalizeAvaChannelDocument as SchemaNormalizer<AnyDocument>,
  calendar: normalizeCalendarDocument as SchemaNormalizer<AnyDocument>,
  todos: normalizeTodosDocument as SchemaNormalizer<AnyDocument>,
  metrics: normalizeMetricsDocument as SchemaNormalizer<AnyDocument>,
  notes: normalizeNotesWorkspace as SchemaNormalizer<AnyDocument>,
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
