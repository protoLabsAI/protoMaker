/**
 * Integration Node — GitHub, Discord
 *
 * Shows external integration connection status.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Github, MessageSquare } from 'lucide-react';
import type { IntegrationNodeData } from '../types';
import { cn } from '@/lib/utils';

const INTEGRATION_ICONS: Record<string, typeof Github> = {
  github: Github,
  discord: MessageSquare,
};

function IntegrationNodeComponent({ data }: NodeProps & { data: IntegrationNodeData }) {
  const Icon = INTEGRATION_ICONS[data.integrationType] || Github;

  return (
    <div
      className={cn(
        'w-[160px] h-[80px] rounded-lg border backdrop-blur-md bg-card/90',
        data.connected ? 'border-emerald-500/30' : 'border-red-500/20'
      )}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-md',
              data.connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            )}
          >
            <Icon className="w-3 h-3" />
          </div>
          <h4 className="text-xs font-semibold">{data.label}</h4>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span
            className={cn(
              'inline-flex h-1.5 w-1.5 rounded-full',
              data.connected ? 'bg-emerald-400' : 'bg-red-400'
            )}
          />
          <span className="text-muted-foreground">{data.connected ? 'Connected' : 'Offline'}</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        className="!bg-border !w-1.5 !h-1.5 !border-0"
      />
    </div>
  );
}

export const IntegrationNode = memo(IntegrationNodeComponent);
