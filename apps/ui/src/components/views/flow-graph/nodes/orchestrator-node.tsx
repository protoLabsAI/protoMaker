/**
 * Orchestrator Node — Ava (center, largest node)
 *
 * Shows aggregate system status with a violet glow ring and breathing animation.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import { Brain, Zap, Activity } from 'lucide-react';
import type { OrchestratorNodeData } from '../types';
import { cn } from '@/lib/utils';

function OrchestratorNodeComponent({ data }: NodeProps & { data: OrchestratorNodeData }) {
  const statusColor =
    data.status === 'error' ? 'red' : data.status === 'active' ? 'violet' : 'zinc';

  return (
    <div className="relative">
      {/* Breathing glow ring */}
      <motion.div
        className={cn(
          'absolute -inset-2 rounded-2xl opacity-40',
          statusColor === 'violet' && 'bg-violet-500/20',
          statusColor === 'red' && 'bg-red-500/20',
          statusColor === 'zinc' && 'bg-zinc-500/10'
        )}
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

      <div
        className={cn(
          'relative w-[320px] h-[160px] rounded-2xl border backdrop-blur-md',
          'bg-card/90 shadow-lg',
          statusColor === 'violet' && 'border-violet-500/40',
          statusColor === 'red' && 'border-red-500/40',
          statusColor === 'zinc' && 'border-border'
        )}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-xl',
                statusColor === 'violet' && 'bg-violet-500/15 text-violet-400',
                statusColor === 'red' && 'bg-red-500/15 text-red-400',
                statusColor === 'zinc' && 'bg-zinc-500/15 text-zinc-400'
              )}
            >
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">{data.label}</h3>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Orchestrator
              </p>
            </div>
            {/* Status indicator */}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {data.status === 'active' && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                )}
                <span
                  className={cn(
                    'relative inline-flex h-2 w-2 rounded-full',
                    data.status === 'active' && 'bg-violet-400',
                    data.status === 'idle' && 'bg-zinc-400',
                    data.status === 'error' && 'bg-red-400'
                  )}
                />
              </span>
              <span className="text-[10px] text-muted-foreground capitalize">{data.status}</span>
            </div>
          </div>

          {/* Metrics row */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="w-3 h-3" />
              <span className="font-medium text-foreground">{data.agentCount}</span>
              <span>agents</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="w-3 h-3" />
              <span className="font-medium text-foreground">{data.featureCount}</span>
              <span>features</span>
            </div>
            {data.autoModeRunning && (
              <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
                Auto-Mode
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="source"
        position={Position.Top}
        className="!bg-violet-500 !w-2 !h-2 !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-violet-500 !w-2 !h-2 !border-0"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className="!bg-violet-500 !w-2 !h-2 !border-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-violet-500 !w-2 !h-2 !border-0"
      />
    </div>
  );
}

export const OrchestratorNode = memo(OrchestratorNodeComponent);
