/**
 * Pipeline Step Node — Generic pipeline step with CVA status variants
 *
 * Displays a pipeline step with status-specific styling:
 * - pending: muted appearance
 * - active: blue glow + spinner
 * - completed: emerald + checkmark
 * - skipped: dashed border + faded
 * - error: red + X icon
 *
 * Size: 180x80px
 * Handles: target top, source bottom
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import {
  FileInput,
  Search,
  FileText,
  CheckCircle,
  ThumbsUp,
  FolderTree,
  Archive,
  Loader2,
  CheckCircle2,
  X,
  Clock,
} from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { PipelineStepNodeData, PipelineStep } from '../types';
import { cn } from '@/lib/utils';

// ============================================
// Step Icon Mapping
// ============================================

const STEP_ICONS: Record<PipelineStep, React.ComponentType<{ className?: string }>> = {
  intake: FileInput,
  research: Search,
  'draft-prd': FileText,
  'review-prd': CheckCircle,
  approve: ThumbsUp,
  scaffold: FolderTree,
  backlog: Archive,
};

// ============================================
// CVA Variants
// ============================================

const nodeVariants = cva(
  'relative w-[180px] h-[80px] rounded-xl border backdrop-blur-md shadow-md transition-all duration-200',
  {
    variants: {
      status: {
        pending: 'bg-card/60 border-border',
        active: 'bg-card/90 border-blue-500/40',
        completed: 'bg-card/90 border-emerald-500/40',
        skipped: 'bg-card/40 border-dashed border-zinc-500/30',
        error: 'bg-card/90 border-red-500/40',
      },
    },
    defaultVariants: {
      status: 'pending',
    },
  }
);

const iconContainerVariants = cva(
  'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
  {
    variants: {
      status: {
        pending: 'bg-zinc-500/10 text-zinc-400',
        active: 'bg-blue-500/15 text-blue-400',
        completed: 'bg-emerald-500/15 text-emerald-400',
        skipped: 'bg-zinc-500/5 text-zinc-400/50',
        error: 'bg-red-500/15 text-red-400',
      },
    },
    defaultVariants: {
      status: 'pending',
    },
  }
);

const statusIndicatorVariants = cva('w-4 h-4', {
  variants: {
    status: {
      pending: 'text-zinc-400',
      active: 'text-blue-400 animate-spin',
      completed: 'text-emerald-400',
      skipped: 'text-zinc-400/50',
      error: 'text-red-400',
    },
  },
  defaultVariants: {
    status: 'pending',
  },
});

// ============================================
// Helper Functions
// ============================================

function formatDuration(startTime: number, endTime: number): string {
  const durationMs = endTime - startTime;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function getStatusIcon(status: PipelineStepNodeData['status']) {
  switch (status) {
    case 'pending':
      return Clock;
    case 'active':
      return Loader2;
    case 'completed':
      return CheckCircle2;
    case 'skipped':
      return Clock;
    case 'error':
      return X;
  }
}

// ============================================
// Component
// ============================================

function PipelineStepNodeComponent({ data }: NodeProps & { data: PipelineStepNodeData }) {
  const StepIcon = STEP_ICONS[data.step];
  const StatusIcon = getStatusIcon(data.status);

  return (
    <div className="relative">
      {/* Breathing glow ring (active state only) */}
      {data.status === 'active' && (
        <motion.div
          className="absolute -inset-2 rounded-xl bg-blue-500/20 opacity-40"
          animate={{
            scale: [1, 1.04, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            filter: `blur(12px)`,
          }}
        />
      )}

      <div className={cn(nodeVariants({ status: data.status }))}>
        <div className="p-3 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-2">
            <div className={cn(iconContainerVariants({ status: data.status }))}>
              <StepIcon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className={cn(
                  'text-xs font-semibold tracking-tight truncate',
                  data.status === 'skipped' && 'text-muted-foreground/60'
                )}
              >
                {data.label}
              </h3>
            </div>
            <StatusIcon className={cn(statusIndicatorVariants({ status: data.status }))} />
          </div>

          {/* Assignee (if present) */}
          {data.assignee && (
            <div
              className={cn(
                'text-[10px] text-muted-foreground truncate',
                data.status === 'skipped' && 'opacity-50'
              )}
            >
              {data.assignee}
            </div>
          )}

          {/* Duration badge (completed state only) */}
          {data.status === 'completed' && data.startTime && data.endTime && (
            <div className="mt-auto">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <Clock className="w-3 h-3" />
                {formatDuration(data.startTime, data.endTime)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          '!w-2 !h-2 !border-0',
          data.status === 'active' && '!bg-blue-500',
          data.status === 'completed' && '!bg-emerald-500',
          data.status === 'error' && '!bg-red-500',
          data.status === 'pending' && '!bg-zinc-500',
          data.status === 'skipped' && '!bg-zinc-500/50'
        )}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!w-2 !h-2 !border-0',
          data.status === 'active' && '!bg-blue-500',
          data.status === 'completed' && '!bg-emerald-500',
          data.status === 'error' && '!bg-red-500',
          data.status === 'pending' && '!bg-zinc-500',
          data.status === 'skipped' && '!bg-zinc-500/50'
        )}
      />
    </div>
  );
}

export const PipelineStepNode = memo(PipelineStepNodeComponent);
