/**
 * Workflow Edge — Animated particles flowing along the path
 *
 * Uses SVG <animateMotion> with <mpath> to move circles along the edge path.
 * Gradient stroke from blue to violet for the base line.
 */

import { memo, useId } from 'react';
import { getSmoothStepPath, type EdgeProps } from '@xyflow/react';

function WorkflowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const uid = useId();
  const gradientId = `workflow-gradient-${uid}`;
  const pathId = `workflow-path-${id}`;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="oklch(0.6 0.18 260)" stopOpacity={0.5} />
          <stop offset="100%" stopColor="oklch(0.6 0.18 290)" stopOpacity={0.5} />
        </linearGradient>
      </defs>

      {/* Background glow */}
      <path
        d={edgePath}
        fill="none"
        stroke="oklch(0.6 0.18 275 / 0.06)"
        strokeWidth={8}
        strokeLinecap="round"
      />

      {/* Base path (thin, gradient) */}
      <path
        id={pathId}
        d={edgePath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* Animated particle 1 */}
      <circle r="3" fill="oklch(0.7 0.2 275)" opacity={0.8}>
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
      <circle r="2" fill="oklch(0.65 0.2 290)" opacity={0.6}>
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
    </g>
  );
}

export const WorkflowEdge = memo(WorkflowEdgeComponent);
