/**
 * Domain document schemas and schema-on-read normalizers.
 *
 * Every domain document includes schemaVersion (starting at 1) and _meta for
 * attribution. Normalizers run on document load to handle legacy field migrations,
 * following the same pattern as FeatureLoader legacy status normalization.
 */

import type { CRDTDocumentRoot, SchemaNormalizer } from './types.js';

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
// Normalizer registry
// ---------------------------------------------------------------------------

type AnyDocument = FeatureDocument | ProjectDocument | ConfigDocument;

const NORMALIZERS: Record<string, SchemaNormalizer<AnyDocument>> = {
  features: normalizeFeatureDocument as SchemaNormalizer<AnyDocument>,
  projects: normalizeProjectDocument as SchemaNormalizer<AnyDocument>,
  config: normalizeConfigDocument as SchemaNormalizer<AnyDocument>,
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
