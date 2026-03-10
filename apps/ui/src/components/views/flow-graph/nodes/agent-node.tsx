/**
 * Agent Node — Dynamic, spawns for running agents
 *
 * Shows model badge, pulsing glow, and elapsed duration.
 */

import { memo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import { Bot } from 'lucide-react';
import type { AgentNodeData, ActiveTool } from '../types';
import { cn } from '@/lib/utils';
import { formatDuration } from '@protolabsai/utils';

function getModelBadge(model?: string): { label: string; color: string } {
  if (!model) return { label: 'Agent', color: 'zinc' };
  if (model.includes('opus')) return { label: 'Opus', color: 'violet' };
  if (model.includes('sonnet')) return { label: 'Sonnet', color: 'blue' };
  if (model.includes('haiku')) return { label: 'Haiku', color: 'emerald' };
  return { label: 'Agent', color: 'zinc' };
}

function AgentNodeComponent({ data }: NodeProps & { data: AgentNodeData }) {
  const badge = getModelBadge(data.model);
  const [duration, setDuration] = useState(formatDuration(Date.now() - data.startTime));
  const [shouldFadeToolBadge, setShouldFadeToolBadge] = useState(false);
  const [lastActiveTool, setLastActiveTool] = useState<ActiveTool | null | undefined>(
    data.activeTool
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(formatDuration(Date.now() - data.startTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [data.startTime]);

  // Handle tool badge fade-out after completion
  useEffect(() => {
    if (data.activeTool) {
      setLastActiveTool(data.activeTool);
      setShouldFadeToolBadge(false);
    } else if (lastActiveTool) {
      // Tool just completed — trigger fade out
      setShouldFadeToolBadge(true);
      const fadeTimeout = setTimeout(() => {
        setLastActiveTool(null);
        setShouldFadeToolBadge(false);
      }, 2000); // Fade duration
      return () => clearTimeout(fadeTimeout);
    }
  }, [data.activeTool, lastActiveTool]);

  // Check if the last tool execution was a failure
  const lastExecution = data.toolExecutions?.at(-1);
  const isFailure = lastExecution?.success === false;

  // Display tool badge if active or fading out
  const displayTool = data.activeTool || (shouldFadeToolBadge && lastActiveTool);

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

          {/* Tool execution badge */}
          {displayTool && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{
                opacity: shouldFadeToolBadge ? 0 : 1,
                y: 0,
              }}
              transition={{
                opacity: { duration: shouldFadeToolBadge ? 2 : 0.3 },
                y: { duration: 0.3 },
              }}
              className={cn(
                'mt-1.5 text-[9px] px-1.5 py-0.5 rounded truncate',
                isFailure
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
              )}
            >
              {displayTool.name}
            </motion.div>
          )}
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
