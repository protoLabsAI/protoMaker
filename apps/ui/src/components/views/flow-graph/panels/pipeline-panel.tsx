/**
 * PipelinePanel — Tracked work items list
 *
 * Shows work items with status dot, title, current stage, elapsed time.
 * Glass-morphism styling matching existing panels.
 */

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface WorkItem {
  id: string;
  title: string;
  status: 'active' | 'completed' | 'error' | 'idle';
  currentStage: string;
  elapsedTime: string;
}

interface PipelinePanelProps {
  workItems: WorkItem[];
}

function getStatusColor(status: WorkItem['status']): string {
  switch (status) {
    case 'active':
      return 'bg-violet-500';
    case 'completed':
      return 'bg-emerald-500';
    case 'error':
      return 'bg-red-500';
    case 'idle':
    default:
      return 'bg-zinc-500';
  }
}

function getStatusTextColor(status: WorkItem['status']): string {
  switch (status) {
    case 'active':
      return 'text-violet-400';
    case 'completed':
      return 'text-emerald-400';
    case 'error':
      return 'text-red-400';
    case 'idle':
    default:
      return 'text-zinc-400';
  }
}

export function PipelinePanel({ workItems }: PipelinePanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="rounded-xl border border-border/50 bg-card/90 backdrop-blur-md shadow-lg p-3 space-y-3 min-w-[280px]"
    >
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
        Pipeline Work Items
      </h3>

      <div className="space-y-2">
        {workItems.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">No active work items</div>
        ) : (
          workItems.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border/30 bg-card/50 p-2.5 space-y-1.5"
            >
              <div className="flex items-start gap-2">
                {/* Status dot */}
                <div className="flex-shrink-0 mt-0.5">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      getStatusColor(item.status),
                      item.status === 'active' && 'animate-pulse'
                    )}
                  />
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.title}</p>
                </div>
              </div>

              {/* Current stage and elapsed time */}
              <div className="flex items-center justify-between text-[10px] pl-4">
                <span className={cn('font-medium', getStatusTextColor(item.status))}>
                  {item.currentStage}
                </span>
                <span className="text-muted-foreground tabular-nums">{item.elapsedTime}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
