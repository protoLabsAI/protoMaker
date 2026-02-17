/**
 * Feature Node — Dynamic, spawns for in_progress/review features
 *
 * Shows feature status badge, title, branch, and optional progress.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import { GitBranch, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import type { FeatureNodeData } from '../types';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof Clock }> = {
  in_progress: { color: 'text-blue-400', bg: 'bg-blue-500/15', icon: Loader2 },
  waiting_approval: { color: 'text-amber-400', bg: 'bg-amber-500/15', icon: Clock },
  verified: { color: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: CheckCircle2 },
  completed: { color: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: CheckCircle2 },
  blocked: { color: 'text-red-400', bg: 'bg-red-500/15', icon: AlertCircle },
  backlog: { color: 'text-zinc-400', bg: 'bg-zinc-500/15', icon: Clock },
};

function FeatureNodeComponent({ data }: NodeProps & { data: FeatureNodeData }) {
  const config = STATUS_CONFIG[data.status] || STATUS_CONFIG.backlog;
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn(
        'w-[180px] rounded-lg border backdrop-blur-md bg-card/90',
        data.status === 'in_progress' && 'border-blue-500/30',
        data.status === 'waiting_approval' && 'border-amber-500/30',
        (data.status === 'verified' || data.status === 'completed') && 'border-emerald-500/30',
        data.status === 'blocked' && 'border-red-500/30',
        (!data.status || data.status === 'backlog') && 'border-border/50'
      )}
    >
      <div className="p-2.5">
        {/* Status badge + title */}
        <div className="flex items-start gap-2 mb-1.5">
          <div
            className={cn(
              'flex items-center justify-center w-5 h-5 rounded shrink-0 mt-0.5',
              config.bg
            )}
          >
            <StatusIcon
              className={cn(
                'w-3 h-3',
                config.color,
                data.status === 'in_progress' && 'animate-spin'
              )}
            />
          </div>
          <h4 className="text-[11px] font-medium leading-tight line-clamp-2">{data.title}</h4>
        </div>

        {/* Branch name */}
        {data.branchName && (
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground truncate">
            <GitBranch className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate font-mono">{data.branchName}</span>
          </div>
        )}

        {/* Progress bar */}
        {data.progress !== undefined && data.progress > 0 && (
          <div className="mt-1.5 h-1 rounded-full bg-muted/50 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-blue-500"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(data.progress, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        )}
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
    </motion.div>
  );
}

export const FeatureNode = memo(FeatureNodeComponent);
