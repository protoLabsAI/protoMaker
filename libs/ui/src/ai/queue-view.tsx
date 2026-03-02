/**
 * QueueView — Visualizes the auto-mode feature pipeline.
 *
 * Shows features ordered by execution priority with status badges.
 * Each queue item shows: feature title, status, complexity badge,
 * estimated position in queue.
 *
 * Props:
 *   items: QueueItem[]         — ordered list of queued features
 *   paused: boolean            — current pause state
 *   onTogglePause: () => void  — callback to pause/resume the queue
 */

import { Pause, Play, ListOrdered } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from '../atoms/button.js';

export type QueueItemStatus = 'backlog' | 'in_progress' | 'review';
export type QueueItemComplexity = 'small' | 'medium' | 'large' | 'architectural';

export interface QueueItem {
  id: string;
  title: string;
  status: QueueItemStatus;
  complexity?: QueueItemComplexity;
  /** 1-based position in execution queue */
  position: number;
}

export interface QueueViewProps {
  items: QueueItem[];
  /** Whether the queue is currently paused */
  paused?: boolean;
  /** Called when the user clicks pause/resume */
  onTogglePause?: () => void;
  className?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Status config
// ────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<QueueItemStatus, { label: string; color: string; dot: string }> = {
  backlog: {
    label: 'Backlog',
    color: 'text-muted-foreground',
    dot: 'bg-muted-foreground/60',
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-blue-500',
    dot: 'bg-blue-500',
  },
  review: {
    label: 'Review',
    color: 'text-amber-500',
    dot: 'bg-amber-500',
  },
};

const COMPLEXITY_CONFIG: Record<QueueItemComplexity, { label: string; color: string }> = {
  small: { label: 'S', color: 'text-green-500' },
  medium: { label: 'M', color: 'text-amber-500' },
  large: { label: 'L', color: 'text-orange-500' },
  architectural: { label: 'A', color: 'text-red-500' },
};

// ────────────────────────────────────────────────────────────────────────────
// QueueItemRow
// ────────────────────────────────────────────────────────────────────────────

function QueueItemRow({ item }: { item: QueueItem }) {
  const statusCfg = STATUS_CONFIG[item.status];
  const complexityCfg = item.complexity ? COMPLEXITY_CONFIG[item.complexity] : null;

  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
      data-queue-item-id={item.id}
    >
      {/* Position number */}
      <span className="w-4 shrink-0 text-center text-[10px] text-muted-foreground/60">
        {item.position}
      </span>

      {/* Status dot */}
      <span
        className={cn('size-1.5 shrink-0 rounded-full', statusCfg.dot)}
        title={statusCfg.label}
      />

      {/* Title */}
      <span className="flex-1 truncate text-[11px] text-foreground/80">{item.title}</span>

      {/* Status badge */}
      <span className={cn('shrink-0 text-[10px]', statusCfg.color)}>{statusCfg.label}</span>

      {/* Complexity badge */}
      {complexityCfg && (
        <span
          className={cn(
            'shrink-0 rounded border border-current px-1 font-mono text-[9px]',
            complexityCfg.color
          )}
          title={`Complexity: ${item.complexity}`}
        >
          {complexityCfg.label}
        </span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// QueueView
// ────────────────────────────────────────────────────────────────────────────

export function QueueView({ items, paused = false, onTogglePause, className }: QueueViewProps) {
  return (
    <div
      data-slot="queue-view"
      className={cn('rounded-md border border-border/50 bg-muted/30 text-xs', className)}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <ListOrdered className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Queue</span>
        <span
          className="ml-1 text-muted-foreground"
          data-testid="queue-depth-count"
          aria-label={`${items.length} item${items.length !== 1 ? 's' : ''} in queue`}
        >
          ({items.length})
        </span>

        {/* Pause / resume toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6"
          onClick={onTogglePause}
          title={paused ? 'Resume queue' : 'Pause queue'}
          aria-label={paused ? 'Resume queue' : 'Pause queue'}
          data-testid="queue-pause-toggle"
        >
          {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
        </Button>
      </div>

      {/* Item list */}
      {items.length === 0 ? (
        <div className="px-3 py-2 text-muted-foreground">No items in queue</div>
      ) : (
        <div className="max-h-48 overflow-y-auto p-1">
          {items.map((item) => (
            <QueueItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
