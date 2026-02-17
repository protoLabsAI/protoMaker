/**
 * Delegation Edge — Gradient stroke with animated dash from Ava to crew/services
 *
 * Uses SVG linearGradient for a violet→transparent fade and animated
 * stroke-dashoffset for subtle directional flow.
 */

import { memo, useId } from 'react';
import { getSmoothStepPath, type EdgeProps } from '@xyflow/react';

function DelegationEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const uid = useId();
  const gradientId = `delegation-gradient-${uid}`;
  const pathId = `delegation-path-${id}`;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="oklch(0.65 0.2 290)" stopOpacity={0.6} />
          <stop offset="100%" stopColor="oklch(0.65 0.2 290)" stopOpacity={0.15} />
        </linearGradient>
      </defs>

      {/* Background glow path */}
      <path
        d={edgePath}
        fill="none"
        stroke="oklch(0.65 0.2 290 / 0.08)"
        strokeWidth={6}
        strokeLinecap="round"
      />

      {/* Main gradient path with animated dash */}
      <path
        id={pathId}
        d={edgePath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={1.5}
        strokeDasharray="8 6"
        strokeLinecap="round"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-28"
          dur="2s"
          repeatCount="indefinite"
        />
      </path>
    </g>
  );
}

export const DelegationEdge = memo(DelegationEdgeComponent);
