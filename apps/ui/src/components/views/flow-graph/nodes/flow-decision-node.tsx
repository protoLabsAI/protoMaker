/**
 * Flow Decision Node — LangGraph branching logic
 *
 * 80x80px diamond (rotated 45°), orange for branching logic.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface FlowDecisionNodeData {
  label: string;
  description?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  type: 'processor' | 'decision' | 'hitl' | 'fanout' | 'aggregate';
}

function FlowDecisionNodeComponent({ data }: NodeProps & { data: FlowDecisionNodeData }) {
  return (
    <div className="relative w-[80px] h-[80px]">
      <div
        className={cn(
          'absolute inset-0 rotate-45 rounded-lg border-2 border-orange-400 bg-orange-50',
          'flex items-center justify-center transition-all',
          data.isCompleted && 'opacity-50'
        )}
      >
        <span className="text-xs font-semibold text-orange-900 -rotate-45 truncate max-w-[50px]">
          {data.label}
        </span>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-orange-400 !w-2 !h-2 !border-0 !-translate-y-1"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-orange-400 !w-2 !h-2 !border-0 !translate-y-1"
      />
      <Handle
        type="source"
        position={Position.Left}
        className="!bg-orange-400 !w-2 !h-2 !border-0 !-translate-x-1"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-orange-400 !w-2 !h-2 !border-0 !translate-x-1"
      />
    </div>
  );
}

export const FlowDecisionNode = memo(FlowDecisionNodeComponent);
