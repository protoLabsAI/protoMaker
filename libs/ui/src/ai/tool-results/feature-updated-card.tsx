/**
 * FeatureUpdatedCard — Before/after field comparison for update_feature tool results.
 * MoveFeatureCard — Status transition arrow for move_feature tool results.
 */

import { Loader2, Edit3, ArrowRight, GitMerge } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

// ---------------------------------------------------------------------------
// Shared types & helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  backlog: { label: 'Backlog', color: 'text-muted-foreground', bg: 'bg-muted/60' },
  in_progress: { label: 'In Progress', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  review: { label: 'Review', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  blocked: { label: 'Blocked', color: 'text-red-500', bg: 'bg-red-500/10' },
  done: { label: 'Done', color: 'text-green-500', bg: 'bg-green-500/10' },
};

function getStatusConfig(status: string | undefined) {
  return (
    STATUS_CONFIG[status ?? ''] ?? {
      label: status ?? status ?? 'Unknown',
      color: 'text-muted-foreground',
      bg: 'bg-muted/60',
    }
  );
}

/** Truncate long text for preview */
function truncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

/** Format any value as a short display string */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return truncate(value);
  return truncate(JSON.stringify(value));
}

/** Make a field name human-readable */
function formatFieldName(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// FeatureUpdatedCard
// ---------------------------------------------------------------------------

interface FieldChange {
  field: string;
  before?: unknown;
  after?: unknown;
  from?: unknown;
  to?: unknown;
}

interface UpdateFeatureData {
  feature?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changes?: FieldChange[] | string[];
  updatedFields?: string[];
  featureId?: string;
  title?: string;
  [key: string]: unknown;
}

function extractUpdateData(output: unknown): UpdateFeatureData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as UpdateFeatureData;
  }
  if ('before' in o || 'after' in o || 'changes' in o || 'updatedFields' in o)
    return o as UpdateFeatureData;
  if ('feature' in o) return o as UpdateFeatureData;
  return null;
}

/** Derive a list of field changes from the data */
function deriveChanges(data: UpdateFeatureData): FieldChange[] {
  // Explicit changes array
  if (Array.isArray(data.changes) && data.changes.length > 0) {
    return data.changes.map((c) => {
      if (typeof c === 'string') return { field: c };
      return c as FieldChange;
    });
  }

  // Before / after diff
  if (data.before && data.after) {
    const keys = new Set([...Object.keys(data.before), ...Object.keys(data.after)]);
    const diffs: FieldChange[] = [];
    for (const key of keys) {
      const bVal = data.before[key];
      const aVal = data.after[key];
      if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        diffs.push({ field: key, before: bVal, after: aVal });
      }
    }
    return diffs;
  }

  // updatedFields list only
  if (Array.isArray(data.updatedFields)) {
    return data.updatedFields.map((f) => ({ field: f }));
  }

  return [];
}

export function FeatureUpdatedCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="feature-updated-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Updating feature…</span>
      </div>
    );
  }

  const data = extractUpdateData(output);

  if (!data) {
    return (
      <div
        data-slot="feature-updated-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Feature updated
      </div>
    );
  }

  const changes = deriveChanges(data);
  const featureTitle =
    (data.feature?.title as string | undefined) ??
    (data.after?.title as string | undefined) ??
    data.title;

  return (
    <div
      data-slot="feature-updated-card"
      className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs"
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-1.5">
        <Edit3 className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Feature Updated</span>
        {featureTitle && (
          <span className="ml-auto max-w-[160px] truncate text-muted-foreground">
            {featureTitle}
          </span>
        )}
      </div>

      {/* Field changes */}
      {changes.length === 0 ? (
        <p className="text-muted-foreground">No field changes recorded</p>
      ) : (
        <div className="space-y-1.5">
          {changes.map((change) => {
            const hasBefore = 'before' in change || 'from' in change;
            const hasAfter = 'after' in change || 'to' in change;
            const beforeVal = change.before ?? change.from;
            const afterVal = change.after ?? change.to;

            return (
              <div key={change.field} className="rounded bg-muted/50 px-2 py-1.5">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {formatFieldName(change.field)}
                </span>
                {hasBefore || hasAfter ? (
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[120px] truncate rounded bg-destructive/10 px-1 py-0.5 font-mono text-destructive/80 line-through">
                      {formatValue(beforeVal)}
                    </span>
                    <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                    <span className="max-w-[120px] truncate rounded bg-green-500/10 px-1 py-0.5 font-mono text-green-600">
                      {formatValue(afterVal)}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">changed</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MoveFeatureCard
// ---------------------------------------------------------------------------

interface MoveFeatureData {
  feature?: { id: string; title?: string; [key: string]: unknown };
  featureId?: string;
  title?: string;
  from?: string;
  to?: string;
  fromStatus?: string;
  toStatus?: string;
  previousStatus?: string;
  newStatus?: string;
  [key: string]: unknown;
}

function extractMoveData(output: unknown): MoveFeatureData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as MoveFeatureData;
  }
  if ('from' in o || 'fromStatus' in o || 'previousStatus' in o) return o as MoveFeatureData;
  if ('feature' in o) return o as MoveFeatureData;
  return null;
}

export function MoveFeatureCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="move-feature-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Moving feature…</span>
      </div>
    );
  }

  const data = extractMoveData(output);

  if (!data) {
    return (
      <div
        data-slot="move-feature-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Feature moved
      </div>
    );
  }

  const fromStatus = data.from ?? data.fromStatus ?? data.previousStatus;
  const toStatus = data.to ?? data.toStatus ?? data.newStatus;
  const featureTitle = data.feature?.title ?? data.title;
  const fromCfg = getStatusConfig(fromStatus);
  const toCfg = getStatusConfig(toStatus);

  return (
    <div
      data-slot="move-feature-card"
      className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs"
    >
      {/* Header */}
      <div className="mb-2.5 flex items-center gap-1.5">
        <GitMerge className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Feature Moved</span>
        {featureTitle && (
          <span className="ml-auto max-w-[160px] truncate text-muted-foreground">
            {featureTitle}
          </span>
        )}
      </div>

      {/* Status transition */}
      <div className="flex items-center gap-2">
        {fromStatus ? (
          <span className={cn('rounded px-2 py-1 font-medium', fromCfg.bg, fromCfg.color)}>
            {fromCfg.label}
          </span>
        ) : (
          <span className="rounded bg-muted/60 px-2 py-1 text-muted-foreground">—</span>
        )}
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        {toStatus ? (
          <span className={cn('rounded px-2 py-1 font-medium', toCfg.bg, toCfg.color)}>
            {toCfg.label}
          </span>
        ) : (
          <span className="rounded bg-muted/60 px-2 py-1 text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
