/**
 * Pipeline Edge — Horizontal smooth step path for pipeline stages
 *
 * Dashed when idle, animated particle flow when active (cyan palette).
 * Active state determined by source completed + target active.
 */

import { memo, useId } from 'react';
import { getSmoothStepPath, type EdgeProps } from '@xyflow/react';

export interface PipelineEdgeData {
  sourceCompleted?: boolean;
  targetActive?: boolean;
}

function PipelineEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<PipelineEdgeData>) {
  const uid = useId();
  const gradientId = `pipeline-gradient-${uid}`;
  const pathId = `pipeline-path-${id}`;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  // Edge is active when source is completed AND target is active
  const isActive = data?.sourceCompleted && data?.targetActive;

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="oklch(0.7 0.15 195)" stopOpacity={0.5} />
          <stop offset="100%" stopColor="oklch(0.7 0.15 210)" stopOpacity={0.5} />
        </linearGradient>
      </defs>

      {isActive ? (
        <>
          {/* Background glow when active */}
          <path
            d={edgePath}
            fill="none"
            stroke="oklch(0.7 0.15 200 / 0.08)"
            strokeWidth={8}
            strokeLinecap="round"
          />

          {/* Base path (solid, gradient) */}
          <path
            id={pathId}
            d={edgePath}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={1.5}
            strokeLinecap="round"
          />

          {/* Animated particle 1 (cyan) */}
          <circle r="3" fill="oklch(0.75 0.15 200)" opacity={0.8}>
            <animateMotion dur="2.5s" repeatCount="indefinite">
              <mpath href={`#${pathId}`} />
            </animateMotion>
            <animate
              attributeName="opacity"
              values="0;0.8;0.8;0"
              keyTimes="0;0.1;0.8;1"
              dur="2.5s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Animated particle 2 (offset timing) */}
          <circle r="2" fill="oklch(0.7 0.15 210)" opacity={0.6}>
            <animateMotion dur="2.5s" repeatCount="indefinite" begin="1.25s">
              <mpath href={`#${pathId}`} />
            </animateMotion>
            <animate
              attributeName="opacity"
              values="0;0.6;0.6;0"
              keyTimes="0;0.1;0.8;1"
              dur="2.5s"
              repeatCount="indefinite"
              begin="1.25s"
            />
          </circle>
        </>
      ) : (
        <>
          {/* Dashed line when idle */}
          <path
            d={edgePath}
            fill="none"
            stroke="oklch(0.4 0.05 240)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray="5,5"
            opacity={0.3}
          />
        </>
      )}
    </g>
  );
}

export const PipelineEdge = memo(PipelineEdgeComponent);
