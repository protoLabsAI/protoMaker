/**
 * FeatureDetailCard — Full feature view for get_feature tool results.
 *
 * Renders a detail card with:
 * - Title with status badge
 * - Description (truncated)
 * - Status and complexity indicators
 * - Agent output preview (summary / error)
 */

import { Loader2, FileText } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface Feature {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  summary?: string;
  error?: string;
  isEpic?: boolean;
  epicId?: string;
  assignee?: string | null;
  prNumber?: number;
  prUrl?: string;
  branchName?: string;
  category?: string;
  costUsd?: number;
  [key: string]: unknown;
}

interface GetFeatureData {
  feature?: Feature;
}

/** Normalize tool output — supports both raw data and ToolResult wrapper */
function extractData(output: unknown): GetFeatureData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Unwrap ToolResult envelope: { success: true, data: { feature: {...} } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as GetFeatureData;
  }
  // Direct feature object
  if ('feature' in o) return o as GetFeatureData;
  // The output itself might be a feature (id + title etc.)
  if ('id' in o) return { feature: o as Feature };
  return null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  backlog: { label: 'Backlog', color: 'text-muted-foreground', bg: 'bg-muted/60' },
  in_progress: { label: 'In Progress', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  review: { label: 'Review', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  blocked: { label: 'Blocked', color: 'text-red-500', bg: 'bg-red-500/10' },
  done: { label: 'Done', color: 'text-green-500', bg: 'bg-green-500/10' },
};

const COMPLEXITY_LABELS: Record<string, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  architectural: 'Architectural',
};

function getStatusConfig(status: string | undefined) {
  return (
    STATUS_CONFIG[status ?? ''] ?? {
      label: status ?? 'Unknown',
      color: 'text-muted-foreground',
      bg: 'bg-muted/60',
    }
  );
}

/** Truncate long text for preview */
function truncate(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

export function FeatureDetailCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="feature-detail-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading feature…</span>
      </div>
    );
  }

  const data = extractData(output);
  const feature = data?.feature;

  if (!feature) {
    return (
      <div
        data-slot="feature-detail-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Feature not found
      </div>
    );
  }

  const statusCfg = getStatusConfig(feature.status);
  const complexityLabel = feature.complexity ? COMPLEXITY_LABELS[feature.complexity] : null;

  return (
    <div
      data-slot="feature-detail-card"
      className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs"
    >
      {/* Header: icon + title */}
      <div className="mb-2 flex items-start gap-2">
        <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug text-foreground/90">
            {feature.title ?? feature.id}
            {feature.isEpic && (
              <span className="ml-1.5 rounded bg-purple-500/10 px-1 py-px text-[9px] text-purple-500">
                EPIC
              </span>
            )}
          </p>
          {feature.id && (
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">{feature.id}</p>
          )}
        </div>
      </div>

      {/* Status + complexity row */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={cn('rounded px-1.5 py-0.5 font-medium', statusCfg.bg, statusCfg.color)}>
          {statusCfg.label}
        </span>
        {complexityLabel && (
          <span className="rounded bg-muted/80 px-1.5 py-0.5 text-muted-foreground">
            {complexityLabel}
          </span>
        )}
        {feature.assignee && (
          <span className="rounded bg-muted/80 px-1.5 py-0.5 text-muted-foreground">
            @{feature.assignee}
          </span>
        )}
        {feature.prNumber && feature.prUrl && (
          <a
            href={feature.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-muted/80 px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
          >
            PR #{feature.prNumber}
          </a>
        )}
        {feature.prNumber && !feature.prUrl && (
          <span className="rounded bg-muted/80 px-1.5 py-0.5 text-muted-foreground">
            PR #{feature.prNumber}
          </span>
        )}
      </div>

      {/* Description */}
      {typeof feature.description === 'string' && feature.description.length > 0 && (
        <p className="mb-2 leading-relaxed text-foreground/70">{truncate(feature.description)}</p>
      )}

      {/* Agent output preview: summary or error */}
      {typeof feature.summary === 'string' && feature.summary.length > 0 && (
        <div className="rounded bg-green-500/5 px-2 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-green-600">
            Summary
          </span>
          <p className="mt-0.5 leading-relaxed text-foreground/70">
            {truncate(feature.summary, 200)}
          </p>
        </div>
      )}
      {typeof feature.error === 'string' && feature.error.length > 0 && (
        <div className="rounded bg-destructive/5 px-2 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-destructive">
            Error
          </span>
          <p className="mt-0.5 font-mono leading-relaxed text-destructive/80">
            {truncate(feature.error, 200)}
          </p>
        </div>
      )}
    </div>
  );
}
