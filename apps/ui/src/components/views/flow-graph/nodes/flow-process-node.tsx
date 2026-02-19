/**
 * Flow Process Node — LangGraph process step
 *
 * 120x40px violet node for process steps.
 * Green pulse when active, reduced opacity when complete.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface FlowProcessNodeData {
  label: string;
  description?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  type: 'processor' | 'decision' | 'hitl' | 'fanout' | 'aggregate';
}

function FlowProcessNodeComponent({ data }: NodeProps & { data: FlowProcessNodeData }) {
  return (
    <div className="relative">
      <div
        className={cn(
          'w-[120px] h-[40px] rounded-lg border-2 border-violet-400 bg-violet-50',
          'flex items-center justify-center px-3 transition-all',
          data.isActive && 'ring-4 ring-green-400 animate-pulse',
          data.isCompleted && 'opacity-50'
        )}
      >
        <span className="text-xs font-semibold text-violet-900 truncate">{data.label}</span>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-violet-400 !w-2 !h-2 !border-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-violet-400 !w-2 !h-2 !border-0"
      />
    </div>
  );
}

export const FlowProcessNode = memo(FlowProcessNodeComponent);
