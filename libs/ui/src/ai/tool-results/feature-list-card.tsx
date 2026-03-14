/**
 * FeatureListCard — Compact feature list for list_features tool results.
 *
 * Renders a scrollable list of compact feature cards, each showing:
 * - Status badge with color coding
 * - Feature title
 * - Complexity indicator
 */

import { Loader2, List } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface CompactFeature {
  id: string;
  title?: string;
  status?: string;
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  epicId?: string;
  isEpic?: boolean;
  branchName?: string;
  prNumber?: number;
  costUsd?: number;
  [key: string]: unknown;
}

interface ListFeaturesData {
  features?: CompactFeature[];
  total?: number;
}

/** Normalize tool output — supports both raw data and ToolResult wrapper */
function extractData(output: unknown): ListFeaturesData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Unwrap ToolResult envelope: { success: true, data: { features: [...] } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as ListFeaturesData;
  }
  // Direct features array
  if ('features' in o && Array.isArray(o.features)) return o as ListFeaturesData;
  return null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  backlog: { label: 'Backlog', color: 'text-muted-foreground', dot: 'bg-muted-foreground/60' },
  in_progress: { label: 'In Progress', color: 'text-blue-500', dot: 'bg-blue-500' },
  review: { label: 'Review', color: 'text-amber-500', dot: 'bg-amber-500' },
  blocked: { label: 'Blocked', color: 'text-red-500', dot: 'bg-red-500' },
  done: { label: 'Done', color: 'text-green-500', dot: 'bg-green-500' },
};

const COMPLEXITY_CONFIG: Record<string, { label: string; color: string }> = {
  small: { label: 'S', color: 'text-green-500' },
  medium: { label: 'M', color: 'text-amber-500' },
  large: { label: 'L', color: 'text-orange-500' },
  architectural: { label: 'A', color: 'text-red-500' },
};

function getStatusConfig(status: string | undefined) {
  return (
    STATUS_CONFIG[status ?? ''] ?? {
      label: status ?? 'Unknown',
      color: 'text-muted-foreground',
      dot: 'bg-muted-foreground/30',
    }
  );
}

function FeatureRow({ feature }: { feature: CompactFeature }) {
  const statusCfg = getStatusConfig(feature.status);
  const complexityCfg = feature.complexity ? COMPLEXITY_CONFIG[feature.complexity] : null;

  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
      data-feature-id={feature.id}
    >
      {/* Status dot */}
      <span
        className={cn('size-1.5 shrink-0 rounded-full', statusCfg.dot)}
        title={statusCfg.label}
      />

      {/* Title */}
      <span className="flex-1 truncate text-foreground/80">
        {feature.title ?? feature.id}
        {feature.isEpic && (
          <span className="ml-1.5 rounded bg-purple-500/10 px-1 py-px text-[9px] text-purple-500">
            EPIC
          </span>
        )}
      </span>

      {/* Status badge */}
      <span className={cn('shrink-0 text-[10px]', statusCfg.color)}>{statusCfg.label}</span>

      {/* Complexity badge */}
      {complexityCfg && (
        <span
          className={cn(
            'shrink-0 rounded border border-current px-1 font-mono text-[9px]',
            complexityCfg.color
          )}
          title={`Complexity: ${feature.complexity}`}
        >
          {complexityCfg.label}
        </span>
      )}
    </div>
  );
}

export function FeatureListCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="feature-list-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading features…</span>
      </div>
    );
  }

  const data = extractData(output);
  const features = Array.isArray(data?.features) ? data.features : [];

  return (
    <div
      data-slot="feature-list-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <List className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Features</span>
        <span className="ml-auto text-muted-foreground">
          {features.length} result{features.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Feature rows */}
      {features.length === 0 ? (
        <div className="px-3 py-2 text-muted-foreground">No features found</div>
      ) : (
        <div className="max-h-48 overflow-y-auto p-1">
          {features.map((feature) => (
            <FeatureRow key={feature.id} feature={feature} />
          ))}
        </div>
      )}
    </div>
  );
}
