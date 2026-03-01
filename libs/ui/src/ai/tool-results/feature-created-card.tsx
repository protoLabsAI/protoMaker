/**
 * FeatureCreatedCard — Success card for create_feature tool results.
 *
 * Renders a success state with:
 * - Feature ID (monospace)
 * - Feature title
 * - "View on Board" navigation link
 */

import { Loader2, PlusCircle, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface CreatedFeature {
  id: string;
  title?: string;
  status?: string;
  complexity?: string;
  [key: string]: unknown;
}

interface CreateFeatureData {
  feature?: CreatedFeature;
  featureId?: string;
  title?: string;
  [key: string]: unknown;
}

/** Normalize tool output — supports both raw data and ToolResult wrapper */
function extractData(output: unknown): CreateFeatureData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Unwrap ToolResult envelope: { success: true, data: { feature: {...} } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as CreateFeatureData;
  }
  // Direct feature wrapper
  if ('feature' in o) return o as CreateFeatureData;
  // The output itself might be a feature
  if ('id' in o) return { feature: o as CreatedFeature };
  // Direct { featureId, title } shape
  if ('featureId' in o) return o as CreateFeatureData;
  return null;
}

export function FeatureCreatedCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="feature-created-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Creating feature…</span>
      </div>
    );
  }

  const data = extractData(output);
  const feature = data?.feature;
  const featureId = feature?.id ?? data?.featureId;
  const featureTitle = feature?.title ?? data?.title;

  if (!featureId) {
    return (
      <div
        data-slot="feature-created-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Feature created
      </div>
    );
  }

  return (
    <div
      data-slot="feature-created-card"
      className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-xs"
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-1.5">
        <PlusCircle className="size-3.5 text-green-500" />
        <span className="font-medium text-green-600 dark:text-green-400">Feature Created</span>
      </div>

      {/* Feature details */}
      <div className={cn('min-w-0', featureTitle ? 'mb-2.5' : 'mb-0')}>
        {featureTitle && (
          <p className="mb-0.5 font-medium leading-snug text-foreground/90">{featureTitle}</p>
        )}
        <p className="font-mono text-[10px] text-muted-foreground/70">{featureId}</p>
      </div>

      {/* View on Board button */}
      <a
        href={`#feature/${featureId}`}
        data-feature-id={featureId}
        className="inline-flex items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-2 py-1 text-[10px] font-medium text-green-600 hover:bg-green-500/20 dark:text-green-400"
      >
        <ExternalLink className="size-3" />
        View on Board
      </a>
    </div>
  );
}
