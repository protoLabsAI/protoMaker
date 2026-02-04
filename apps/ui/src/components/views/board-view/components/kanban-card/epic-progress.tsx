/**
 * EpicProgress - Shows completion progress for epic features
 */

import { Feature, useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';

interface EpicProgressProps {
  feature: Feature;
  className?: string;
}

interface ProgressStats {
  total: number;
  done: number;
  inProgress: number;
  backlog: number;
}

function getProgressStats(childFeatures: Feature[]): ProgressStats {
  const stats: ProgressStats = {
    total: childFeatures.length,
    done: 0,
    inProgress: 0,
    backlog: 0,
  };

  for (const child of childFeatures) {
    if (child.status === 'done' || child.status === 'verified') {
      stats.done++;
    } else if (
      child.status === 'in_progress' ||
      child.status === 'waiting_approval' ||
      child.status?.startsWith('pipeline_')
    ) {
      stats.inProgress++;
    } else {
      stats.backlog++;
    }
  }

  return stats;
}

export function EpicProgress({ feature, className }: EpicProgressProps) {
  // Get all child features for this epic
  const childFeatures = useAppStore(
    useShallow((state) => {
      if (!feature.isEpic) return [];
      return state.features.filter((f) => f.epicId === feature.id);
    })
  );

  // Don't render if not an epic or no children
  if (!feature.isEpic || childFeatures.length === 0) {
    return null;
  }

  const stats = getProgressStats(childFeatures);
  const percentage = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  // Calculate segment widths
  const doneWidth = (stats.done / stats.total) * 100;
  const inProgressWidth = (stats.inProgress / stats.total) * 100;

  return (
    <div className={cn('space-y-1', className)}>
      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
        {/* Done segment */}
        {doneWidth > 0 && (
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${doneWidth}%` }}
          />
        )}
        {/* In progress segment */}
        {inProgressWidth > 0 && (
          <div
            className="h-full bg-amber-500 transition-all duration-300"
            style={{ width: `${inProgressWidth}%` }}
          />
        )}
        {/* Backlog is the remaining space (transparent/muted background) */}
      </div>

      {/* Stats text */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {stats.done}/{stats.total} complete
        </span>
        <span>{percentage}%</span>
      </div>
    </div>
  );
}
