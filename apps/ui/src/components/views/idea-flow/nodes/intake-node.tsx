/**
 * Intake Node — Idea entry point
 *
 * Shows idea title with Lightbulb icon, pulsing status dot when active, and timestamp.
 * Fixed dimensions: 220x90px
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IntakeNodeData {
  title: string;
  status: 'active' | 'idle';
  timestamp: string;
  [key: string]: unknown;
}

function IntakeNodeComponent({ data }: NodeProps & { data: IntakeNodeData }) {
  const isActive = data.status === 'active';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="w-[220px] h-[90px] rounded-lg border border-border/50 backdrop-blur-md bg-card/90"
    >
      <div className="p-3 h-full flex flex-col">
        {/* Header: Icon + Status Dot */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center justify-center w-6 h-6 rounded bg-amber-500/15 shrink-0">
            <Lightbulb className="w-4 h-4 text-amber-400" />
          </div>
          {isActive && (
            <motion.div
              className="w-2 h-2 rounded-full bg-emerald-400"
              animate={{
                opacity: [0.5, 1, 0.5],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 2,
                repeat: Number.POSITIVE_INFINITY,
                ease: 'easeInOut',
              }}
            />
          )}
        </div>

        {/* Title - truncated to 2 lines */}
        <h4 className="text-xs font-medium leading-tight line-clamp-2 mb-auto">{data.title}</h4>

        {/* Timestamp */}
        <div className="text-[10px] text-muted-foreground mt-1">{data.timestamp}</div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
    </motion.div>
  );
}

export const IntakeNode = memo(IntakeNodeComponent);
