/**
 * Terminal Node — End state for ideas
 *
 * Pill-shaped node with outcome-driven coloring:
 * - emerald: completed
 * - red: failed
 * - zinc: rejected
 * Optional Langfuse trace link.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import { ExternalLink, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TerminalNodeData {
  outcome: 'completed' | 'failed' | 'rejected';
  label?: string;
  traceUrl?: string;
  [key: string]: unknown;
}

const OUTCOME_CONFIG = {
  completed: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    icon: CheckCircle2,
  },
  failed: {
    color: 'text-red-400',
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    icon: XCircle,
  },
  rejected: {
    color: 'text-zinc-400',
    bg: 'bg-zinc-500/15',
    border: 'border-zinc-500/30',
    icon: Ban,
  },
} as const;

function TerminalNodeComponent({ data }: NodeProps & { data: TerminalNodeData }) {
  const config = OUTCOME_CONFIG[data.outcome];
  const OutcomeIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn('rounded-full border backdrop-blur-md bg-card/90 px-4 py-2', config.border)}
    >
      <div className="flex items-center gap-2">
        {/* Outcome badge */}
        <div className={cn('flex items-center justify-center w-5 h-5 rounded shrink-0', config.bg)}>
          <OutcomeIcon className={cn('w-3 h-3', config.color)} />
        </div>

        {/* Label */}
        <span className="text-xs font-medium capitalize">{data.label || data.outcome}</span>

        {/* Langfuse trace link */}
        {data.traceUrl && (
          <a
            href={data.traceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-4 h-4 text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
    </motion.div>
  );
}

export const TerminalNode = memo(TerminalNodeComponent);
