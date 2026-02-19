/**
 * Pipeline Stage Node — Visual pipeline flow stages
 *
 * Shows stage label, item count badge, status-colored border glow, and breathing animation.
 * Uses canonical PipelineStageNodeData from types.ts (stageId, workItems).
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import {
  Inbox,
  Play,
  Eye,
  GitMerge,
  FlaskConical,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { PipelineStageNodeData, PipelineStageId } from '../types';
import { cn } from '@/lib/utils';

// Map stageId to an icon
const STAGE_ICONS: Record<PipelineStageId, typeof Inbox> = {
  backlog: Inbox,
  in_progress: Play,
  review: Eye,
  merge: GitMerge,
  test: FlaskConical,
  verify: ShieldCheck,
  done: CheckCircle2,
  blocked: AlertTriangle,
};

type StatusLike = PipelineStageNodeData['status'];

function getBorderColor(status: StatusLike): string {
  switch (status) {
    case 'active':
      return 'border-violet-500/40';
    case 'blocked':
      return 'border-amber-500/40';
    case 'error':
      return 'border-red-500/40';
    case 'idle':
    default:
      return 'border-border/50';
  }
}

function getGlowColor(status: StatusLike): string {
  switch (status) {
    case 'active':
      return 'bg-violet-500/20';
    case 'blocked':
      return 'bg-amber-500/20';
    case 'error':
      return 'bg-red-500/20';
    case 'idle':
    default:
      return 'bg-zinc-500/10';
  }
}

function getIconColor(status: StatusLike): string {
  switch (status) {
    case 'active':
      return 'text-violet-400';
    case 'blocked':
      return 'text-amber-400';
    case 'error':
      return 'text-red-400';
    case 'idle':
    default:
      return 'text-zinc-400';
  }
}

function PipelineStageNodeComponent({ data }: NodeProps & { data: PipelineStageNodeData }) {
  const Icon = STAGE_ICONS[data.stageId] || Inbox;
  const borderColor = getBorderColor(data.status);
  const glowColor = getGlowColor(data.status);
  const iconColor = getIconColor(data.status);
  const isActive = data.status === 'active';
  const itemCount = data.workItems?.length ?? 0;

  return (
    <div className="relative">
      {/* Breathing glow animation (only when active) */}
      {isActive && (
        <motion.div
          className={cn('absolute -inset-1 rounded-xl opacity-30', glowColor)}
          animate={{
            scale: [1, 1.08, 1],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ filter: 'blur(10px)' }}
        />
      )}

      <div
        className={cn(
          'relative w-[160px] h-[90px] rounded-xl border backdrop-blur-md bg-card/90',
          borderColor
        )}
      >
        <div className="flex flex-col items-center justify-center h-full p-3 gap-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-lg',
                isActive && 'bg-violet-500/15',
                data.status === 'blocked' && 'bg-amber-500/15',
                data.status === 'error' && 'bg-red-500/15',
                data.status === 'idle' && 'bg-zinc-500/10'
              )}
            >
              <Icon className={cn('w-4 h-4', iconColor)} />
            </div>
            {/* Item count badge */}
            {itemCount > 0 && (
              <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
                {itemCount}
              </span>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold truncate max-w-[140px]">{data.label}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{data.status}</p>
          </div>
        </div>

        <Handle
          type="target"
          position={Position.Left}
          className="!bg-border !w-1.5 !h-1.5 !border-0"
        />
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-border !w-1.5 !h-1.5 !border-0"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-border !w-1.5 !h-1.5 !border-0"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className="!bg-border !w-1.5 !h-1.5 !border-0"
        />
      </div>
    </div>
  );
}

export const PipelineStageNode = memo(PipelineStageNodeComponent);
