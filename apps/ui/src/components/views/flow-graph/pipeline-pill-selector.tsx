/**
 * PipelinePillSelector — Horizontal row of chips for switching between active pipelines.
 *
 * Each pill shows a truncated feature title + a colored status dot:
 *   - violet pulse  = active (running)
 *   - amber pulse   = gate-waiting
 *   - emerald       = completed (PUBLISH)
 *
 * Hidden automatically when only one pipeline is active.
 */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { PipelineEntry } from './hooks/use-pipeline-progress';

interface PipelinePillSelectorProps {
  pipelines: PipelineEntry[];
  selectedFeatureId: string | null;
  onSelect: (featureId: string) => void;
}

function StatusDot({ entry }: { entry: PipelineEntry }) {
  if (entry.awaitingGate) {
    return (
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
    );
  }
  if (entry.currentPhase === 'PUBLISH') {
    return <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />;
  }
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
    </span>
  );
}

function PipelinePillSelectorComponent({
  pipelines,
  selectedFeatureId,
  onSelect,
}: PipelinePillSelectorProps) {
  // Don't render when 0 or 1 pipeline — no need for a selector
  if (pipelines.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-card/60 border border-border/40 backdrop-blur-sm">
      {pipelines.map((entry) => {
        const isSelected = entry.featureId === selectedFeatureId;
        return (
          <button
            key={entry.featureId}
            type="button"
            onClick={() => onSelect(entry.featureId)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
              isSelected
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-muted/30'
            )}
          >
            <StatusDot entry={entry} />
            <span className="max-w-[100px] truncate">{entry.featureTitle}</span>
          </button>
        );
      })}
    </div>
  );
}

export const PipelinePillSelector = memo(PipelinePillSelectorComponent);
