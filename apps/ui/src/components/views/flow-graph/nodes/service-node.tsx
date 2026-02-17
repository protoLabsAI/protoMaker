/**
 * Service Node — Auto-Mode, Lead Engineer
 *
 * Shows service running state and queue depth.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Play, Pause, BotMessageSquare, Cog } from 'lucide-react';
import type { ServiceNodeData } from '../types';
import { cn } from '@/lib/utils';

const SERVICE_ICONS: Record<string, typeof Cog> = {
  'auto-mode': Cog,
  'lead-engineer': BotMessageSquare,
};

function ServiceNodeComponent({ data }: NodeProps & { data: ServiceNodeData }) {
  const Icon = SERVICE_ICONS[data.serviceType] || Cog;

  return (
    <div
      className={cn(
        'w-[200px] h-[100px] rounded-xl border backdrop-blur-md bg-card/90',
        data.running ? 'border-violet-500/30' : 'border-border/50'
      )}
    >
      <div className="p-3.5">
        <div className="flex items-center gap-2.5 mb-2">
          <div
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-lg',
              data.running ? 'bg-violet-500/15 text-violet-400' : 'bg-zinc-500/15 text-zinc-400'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold truncate">{data.label}</h4>
            <p className="text-[10px] text-muted-foreground">Service</p>
          </div>
          {data.running ? (
            <Play className="w-3 h-3 text-violet-400 shrink-0" />
          ) : (
            <Pause className="w-3 h-3 text-zinc-400 shrink-0" />
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className={data.running ? 'text-violet-400' : ''}>
            {data.running ? 'Running' : 'Idle'}
          </span>
          {data.queueDepth > 0 && (
            <span className="tabular-nums font-medium text-foreground">
              {data.queueDepth} queued
            </span>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Right}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
      <Handle
        type="source"
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

export const ServiceNode = memo(ServiceNodeComponent);
