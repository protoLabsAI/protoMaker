/**
 * Flow HITL Node — Human-in-the-Loop interaction
 *
 * 120x40px red node with user icon.
 * Yellow pulse when active (signals human action needed).
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FlowHitlNodeData {
  label: string;
  description?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  type: 'processor' | 'decision' | 'hitl' | 'fanout' | 'aggregate';
}

function FlowHitlNodeComponent({ data }: NodeProps & { data: FlowHitlNodeData }) {
  return (
    <div className="relative">
      <div
        className={cn(
          'w-[120px] h-[40px] rounded-lg border-2 border-red-400 bg-red-50',
          'flex items-center justify-center gap-2 px-3 transition-all',
          data.isActive && 'ring-4 ring-yellow-400 animate-pulse',
          data.isCompleted && 'opacity-50'
        )}
      >
        <User className="w-3.5 h-3.5 text-red-600 shrink-0" />
        <span className="text-xs font-semibold text-red-900 truncate">{data.label}</span>
      </div>

      <Handle type="target" position={Position.Top} className="!bg-red-400 !w-2 !h-2 !border-0" />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-red-400 !w-2 !h-2 !border-0"
      />
    </div>
  );
}

export const FlowHitlNode = memo(FlowHitlNodeComponent);
