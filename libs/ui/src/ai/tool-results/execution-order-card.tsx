/**
 * ExecutionOrderCard — Ordered feature list for get_execution_order tool results.
 *
 * Renders:
 * - Numbered list of features in execution order
 * - Dependency arrows between features
 */

import { Loader2, GitGraph, ArrowDown, Link2 } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface OrderedFeature {
  id: string;
  title?: string;
  status?: string;
  complexity?: string;
  dependsOn?: string[];
  dependencies?: string[];
  blockedBy?: string[];
  order?: number;
  [key: string]: unknown;
}

interface ExecutionOrderData {
  features?: OrderedFeature[];
  order?: OrderedFeature[] | string[];
  executionOrder?: OrderedFeature[] | string[];
  [key: string]: unknown;
}

function extractData(output: unknown): ExecutionOrderData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as ExecutionOrderData;
  }
  if ('features' in o || 'order' in o || 'executionOrder' in o) return o as ExecutionOrderData;
  return null;
}

/** Normalize the feature list from various shapes */
function getOrderedFeatures(data: ExecutionOrderData): OrderedFeature[] {
  // executionOrder as feature objects
  if (Array.isArray(data.executionOrder) && data.executionOrder.length > 0) {
    const first = data.executionOrder[0];
    if (typeof first === 'object' && first !== null && 'id' in (first as object)) {
      return data.executionOrder as OrderedFeature[];
    }
    // Array of IDs — try to match with features
    if (typeof first === 'string' && Array.isArray(data.features)) {
      const featureMap = new Map(data.features.map((f) => [f.id, f]));
      return (data.executionOrder as string[]).map((id) => featureMap.get(id) ?? { id });
    }
  }

  // order field
  if (Array.isArray(data.order) && data.order.length > 0) {
    const first = data.order[0];
    if (typeof first === 'object' && first !== null && 'id' in (first as object)) {
      return data.order as OrderedFeature[];
    }
    if (typeof first === 'string' && Array.isArray(data.features)) {
      const featureMap = new Map(data.features.map((f) => [f.id, f]));
      return (data.order as string[]).map((id) => featureMap.get(id) ?? { id });
    }
  }

  // features array
  if (Array.isArray(data.features) && data.features.length > 0) {
    return [...data.features].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return [];
}

const STATUS_CONFIG: Record<string, { color: string; dot: string }> = {
  backlog: { color: 'text-muted-foreground', dot: 'bg-muted-foreground/60' },
  in_progress: { color: 'text-blue-500', dot: 'bg-blue-500' },
  review: { color: 'text-amber-500', dot: 'bg-amber-500' },
  blocked: { color: 'text-red-500', dot: 'bg-red-500' },
  done: { color: 'text-green-500', dot: 'bg-green-500' },
};

function getStatusDot(status: string | undefined) {
  return STATUS_CONFIG[status ?? '']?.dot ?? 'bg-muted-foreground/40';
}

function getDeps(feature: OrderedFeature): string[] {
  const raw = feature.dependsOn ?? feature.dependencies ?? feature.blockedBy;
  return Array.isArray(raw) ? raw : [];
}

export function ExecutionOrderCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="execution-order-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading execution order…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data) {
    return (
      <div
        data-slot="execution-order-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Execution order unavailable
      </div>
    );
  }

  const features = getOrderedFeatures(data);

  return (
    <div
      data-slot="execution-order-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <GitGraph className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Execution Order</span>
        <span className="ml-auto text-muted-foreground">
          {features.length} feature{features.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Feature list */}
      {features.length === 0 ? (
        <div className="px-3 py-2 text-muted-foreground">No features in execution order</div>
      ) : (
        <div className="p-2">
          {features.map((feature, index) => {
            const deps = getDeps(feature);
            const isLast = index === features.length - 1;

            return (
              <div key={feature.id} className="relative">
                {/* Feature row */}
                <div
                  className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                  data-feature-id={feature.id}
                >
                  {/* Order number */}
                  <span
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                      'bg-muted text-muted-foreground'
                    )}
                  >
                    {index + 1}
                  </span>

                  {/* Status dot */}
                  <span
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      getStatusDot(feature.status)
                    )}
                  />

                  {/* Title / ID */}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-foreground/80">
                      {feature.title ?? feature.id}
                    </span>
                    {feature.title && (
                      <span className="font-mono text-[9px] text-muted-foreground/50">
                        {feature.id}
                      </span>
                    )}
                  </div>
                </div>

                {/* Dependency indicators */}
                {deps.length > 0 && (
                  <div className="ml-8 mb-0.5 flex flex-wrap items-center gap-1 px-2 pb-1">
                    <Link2 className="size-2.5 shrink-0 text-muted-foreground/50" />
                    <span className="text-[9px] text-muted-foreground/50">depends on:</span>
                    {deps.map((depId) => (
                      <span
                        key={depId}
                        className="rounded bg-muted/70 px-1 font-mono text-[9px] text-muted-foreground/70"
                      >
                        {depId}
                      </span>
                    ))}
                  </div>
                )}

                {/* Arrow connector between items */}
                {!isLast && (
                  <div className="ml-4 flex items-center px-2">
                    <ArrowDown className="size-3 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
