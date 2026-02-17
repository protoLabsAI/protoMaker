/**
 * Agent Node — Dynamic, spawns for running agents
 *
 * Shows model badge, pulsing glow, and elapsed duration.
 */

import { memo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import { Bot } from 'lucide-react';
import type { AgentNodeData } from '../types';
import { cn } from '@/lib/utils';

function getModelBadge(model?: string): { label: string; color: string } {
  if (!model) return { label: 'Agent', color: 'zinc' };
  if (model.includes('opus')) return { label: 'Opus', color: 'violet' };
  if (model.includes('sonnet')) return { label: 'Sonnet', color: 'blue' };
  if (model.includes('haiku')) return { label: 'Haiku', color: 'emerald' };
  return { label: 'Agent', color: 'zinc' };
}

function formatDuration(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function AgentNodeComponent({ data }: NodeProps & { data: AgentNodeData }) {
  const badge = getModelBadge(data.model);
  const [duration, setDuration] = useState(formatDuration(data.startTime));

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(formatDuration(data.startTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [data.startTime]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="relative"
    >
      {/* Pulsing glow */}
      <motion.div
        className={cn(
          'absolute -inset-1 rounded-lg opacity-30',
          badge.color === 'violet' && 'bg-violet-500/20',
          badge.color === 'blue' && 'bg-blue-500/20',
          badge.color === 'emerald' && 'bg-emerald-500/20',
          badge.color === 'zinc' && 'bg-zinc-500/10'
        )}
        animate={{
          scale: [1, 1.06, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{ filter: 'blur(8px)' }}
      />

      <div
        className={cn(
          'relative w-[160px] rounded-lg border backdrop-blur-md bg-card/90',
          badge.color === 'violet' && 'border-violet-500/30',
          badge.color === 'blue' && 'border-blue-500/30',
          badge.color === 'emerald' && 'border-emerald-500/30',
          badge.color === 'zinc' && 'border-border/50'
        )}
      >
        <div className="p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Bot
              className={cn(
                'w-3.5 h-3.5',
                badge.color === 'violet' && 'text-violet-400',
                badge.color === 'blue' && 'text-blue-400',
                badge.color === 'emerald' && 'text-emerald-400',
                badge.color === 'zinc' && 'text-zinc-400'
              )}
            />
            <span
              className={cn(
                'text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
                badge.color === 'violet' && 'bg-violet-500/15 text-violet-400',
                badge.color === 'blue' && 'bg-blue-500/15 text-blue-400',
                badge.color === 'emerald' && 'bg-emerald-500/15 text-emerald-400',
                badge.color === 'zinc' && 'bg-zinc-500/15 text-zinc-400'
              )}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{data.title}</p>
          <p className="text-[10px] tabular-nums text-muted-foreground mt-0.5">{duration}</p>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
    </motion.div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
