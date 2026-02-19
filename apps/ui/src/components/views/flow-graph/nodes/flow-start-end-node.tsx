/**
 * Flow Start/End Node — Graph entry/exit points
 *
 * 80x40px rounded node for start and end points.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface FlowStartEndNodeData {
  label: string;
  description?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  type: 'processor' | 'decision' | 'hitl' | 'fanout' | 'aggregate';
  nodeType: 'start' | 'end';
}

function FlowStartEndNodeComponent({ data }: NodeProps & { data: FlowStartEndNodeData }) {
  const isStart = data.nodeType === 'start';

  return (
    <div className="relative">
      <div
        className={cn(
          'w-[80px] h-[40px] rounded-full border-2 flex items-center justify-center px-3 transition-all',
          isStart
            ? 'border-green-400 bg-green-50 text-green-900'
            : 'border-gray-400 bg-gray-50 text-gray-900',
          data.isCompleted && 'opacity-50'
        )}
      >
        <span className="text-xs font-semibold truncate">{data.label}</span>
      </div>

      {isStart && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-green-400 !w-2 !h-2 !border-0"
        />
      )}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-gray-400 !w-2 !h-2 !border-0"
        />
      )}
    </div>
  );
}

export const FlowStartEndNode = memo(FlowStartEndNodeComponent);
