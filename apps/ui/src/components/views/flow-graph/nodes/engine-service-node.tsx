/**
 * Engine Service Node — Unified service node for the real engine topology.
 *
 * Shows: service name, status indicator, throughput counter, status line.
 * Used for all EngineServiceId values across pre-production, production, and reflection lanes.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import {
  Antenna,
  Route,
  FileText,
  Network,
  Rocket,
  Cog,
  Bot,
  GitBranch,
  MessageSquare,
  BotMessageSquare,
  RefreshCw,
  PenTool,
} from 'lucide-react';
import type { EngineServiceNodeData, EngineServiceId } from '../types';
import { cn } from '@/lib/utils';

const SERVICE_ICONS: Record<EngineServiceId, typeof Cog> = {
  'signal-sources': Antenna,
  triage: Route,
  'project-planning': FileText,
  decomposition: Network,
  launch: Rocket,
  'auto-mode': Cog,
  'agent-execution': Bot,
  'git-workflow': GitBranch,
  'pr-feedback': MessageSquare,
  'lead-engineer-rules': BotMessageSquare,
  reflection: RefreshCw,
  'content-pipeline': PenTool,
};

function getStatusColor(status: EngineServiceNodeData['status']) {
  switch (status) {
    case 'active':
      return {
        border: 'border-violet-500/40',
        bg: 'bg-violet-500/15',
        text: 'text-violet-400',
        glow: 'bg-violet-500/20',
        dot: 'bg-violet-400',
      };
    case 'error':
      return {
        border: 'border-red-500/40',
        bg: 'bg-red-500/15',
        text: 'text-red-400',
        glow: 'bg-red-500/20',
        dot: 'bg-red-400',
      };
    case 'idle':
    default:
      return {
        border: 'border-border/50',
        bg: 'bg-zinc-500/10',
        text: 'text-zinc-400',
        glow: 'bg-zinc-500/10',
        dot: 'bg-zinc-400',
      };
  }
}

function EngineServiceNodeComponent({ data }: NodeProps & { data: EngineServiceNodeData }) {
  const Icon = SERVICE_ICONS[data.serviceId] || Cog;
  const colors = getStatusColor(data.status);
  const isActive = data.status === 'active';
  const hasAssociatedFlow = !!data.graphId;
  const pipelineHighlight = data.pipelineHighlight as 'processing' | 'gate-waiting' | undefined;

  const handleClick = () => {
    if (hasAssociatedFlow && data.onNodeClick) {
      data.onNodeClick(data.serviceId, data.graphId!);
    }
  };

  return (
    <div className="relative">
      {/* Pipeline phase highlight ring */}
      {pipelineHighlight && (
        <motion.div
          className={cn(
            'absolute -inset-2 rounded-xl border-2',
            pipelineHighlight === 'processing' ? 'border-violet-400/60' : 'border-amber-400/60'
          )}
          animate={{
            scale: [1, 1.03, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: pipelineHighlight === 'gate-waiting' ? 1.5 : 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
      {/* Breathing glow when active */}
      {isActive && (
        <motion.div
          className={cn('absolute -inset-1.5 rounded-xl opacity-30', colors.glow)}
          animate={{
            scale: [1, 1.06, 1],
            opacity: [0.2, 0.45, 0.2],
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
          'relative w-[220px] h-[110px] rounded-xl border backdrop-blur-md bg-card/90',
          colors.border,
          hasAssociatedFlow && 'cursor-pointer hover:border-violet-500/60 transition-colors'
        )}
        onClick={handleClick}
      >
        <div className="p-3.5">
          {/* Header row: icon + name + status dot */}
          <div className="flex items-center gap-2.5 mb-2">
            <div className={cn('flex items-center justify-center w-8 h-8 rounded-lg', colors.bg)}>
              <Icon className={cn('w-4 h-4', colors.text)} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-semibold truncate">{data.label}</h4>
              <p className="text-[10px] text-muted-foreground">Engine Service</p>
            </div>
            {/* Status dot with ping animation */}
            <span className="relative flex h-2 w-2 shrink-0">
              {isActive && (
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                    colors.dot
                  )}
                />
              )}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', colors.dot)} />
            </span>
          </div>

          {/* Metrics row */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className={isActive ? colors.text : ''}>
              {data.status === 'active' ? 'Active' : data.status === 'error' ? 'Error' : 'Idle'}
            </span>
            {data.throughput > 0 && (
              <span className="tabular-nums font-medium text-foreground">
                {data.throughput} {data.throughput === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>

          {/* Status line */}
          {data.statusLine && (
            <p className="mt-1 text-[10px] text-muted-foreground truncate">{data.statusLine}</p>
          )}
        </div>
      </div>

      {/* Handles — all four sides for flexible edge routing */}
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
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
    </div>
  );
}

export const EngineServiceNode = memo(EngineServiceNodeComponent);
