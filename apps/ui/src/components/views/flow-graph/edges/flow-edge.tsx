/**
 * Flow Edge — LangGraph edge connector
 *
 * Thin edges with smooth step path.
 * Orange for conditional edges, violet for standard.
 * Edge labels for routing decisions.
 */

import { memo } from 'react';
import { getSmoothStepPath, EdgeLabelRenderer, type EdgeProps, BaseEdge } from '@xyflow/react';

export interface FlowEdgeData {
  label?: string;
  isConditional?: boolean;
}

function FlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  const edgeData = data as FlowEdgeData | undefined;
  const isConditional = edgeData?.isConditional ?? false;
  const strokeColor = isConditional ? 'oklch(0.65 0.18 40)' : 'oklch(0.65 0.2 290)';

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: strokeColor, strokeWidth: 2 }} />

      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div
              className={`px-2 py-1 rounded text-[10px] font-medium border ${
                isConditional
                  ? 'bg-orange-50 text-orange-900 border-orange-400'
                  : 'bg-violet-50 text-violet-900 border-violet-400'
              }`}
            >
              {edgeData.label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeComponent);
