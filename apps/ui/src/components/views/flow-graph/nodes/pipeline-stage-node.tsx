/**
 * Pipeline Stage Node — Visual pipeline flow stages
 *
 * Shows stage icon, status-colored border glow, and breathing animation when active.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import {
  Radio,
  Search,
  FileText,
  ShieldCheck,
  Bot,
  GitBranch,
  GitMerge,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Stage icon mapping
const STAGE_ICONS = {
  intake: Radio,
  research: Search,
  prd: FileText,
  review: ShieldCheck,
  agent: Bot,
  pr: GitBranch,
  merge: GitMerge,
  reflect: Sparkles,
} as const;

export interface PipelineStageNodeData {
  stage: keyof typeof STAGE_ICONS;
  label: string;
  status: 'active' | 'completed' | 'error' | 'idle';
  [key: string]: unknown;
}

function getBorderColor(status: PipelineStageNodeData['status']): string {
  switch (status) {
    case 'active':
      return 'border-violet-500/40';
    case 'completed':
      return 'border-emerald-500/40';
    case 'error':
      return 'border-red-500/40';
    case 'idle':
    default:
      return 'border-border/50';
  }
}

function getGlowColor(status: PipelineStageNodeData['status']): string {
  switch (status) {
    case 'active':
      return 'bg-violet-500/20';
    case 'completed':
      return 'bg-emerald-500/20';
    case 'error':
      return 'bg-red-500/20';
    case 'idle':
    default:
      return 'bg-zinc-500/10';
  }
}

function getIconColor(status: PipelineStageNodeData['status']): string {
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

function PipelineStageNodeComponent({ data }: NodeProps & { data: PipelineStageNodeData }) {
  const Icon = STAGE_ICONS[data.stage] || Radio;
  const borderColor = getBorderColor(data.status);
  const glowColor = getGlowColor(data.status);
  const iconColor = getIconColor(data.status);
  const isActive = data.status === 'active';

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
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg',
              isActive && 'bg-violet-500/15',
              data.status === 'completed' && 'bg-emerald-500/15',
              data.status === 'error' && 'bg-red-500/15',
              data.status === 'idle' && 'bg-zinc-500/10'
            )}
          >
            <Icon className={cn('w-4 h-4', iconColor)} />
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
          type="source"
          position={Position.Right}
          className="!bg-border !w-1.5 !h-1.5 !border-0"
        />
      </div>
    </div>
  );
}

export const PipelineStageNode = memo(PipelineStageNodeComponent);
