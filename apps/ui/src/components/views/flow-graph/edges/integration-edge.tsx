/**
 * Integration Edge — Thin health-colored connection to external services
 *
 * Uses a gradient from emerald (connected) with subtle opacity pulse
 * to indicate liveness.
 */

import { memo, useId } from 'react';
import { getSmoothStepPath, type EdgeProps } from '@xyflow/react';

function IntegrationEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const uid = useId();
  const gradientId = `integration-gradient-${uid}`;
  const pathId = `integration-path-${id}`;

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
          <stop offset="0%" stopColor="oklch(0.7 0.17 155)" stopOpacity={0.5} />
          <stop offset="100%" stopColor="oklch(0.7 0.17 155)" stopOpacity={0.2} />
        </linearGradient>
      </defs>

      {/* Base path with gradient */}
      <path
        id={pathId}
        d={edgePath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={1}
        strokeLinecap="round"
      >
        <animate
          attributeName="stroke-opacity"
          values="1;0.5;1"
          dur="4s"
          repeatCount="indefinite"
        />
      </path>

      {/* Small dot traveling along the path (slow, subtle) */}
      <circle r="1.5" fill="oklch(0.75 0.15 155)" opacity={0.5}>
        <animateMotion dur="5s" repeatCount="indefinite">
          <mpath href={`#${pathId}`} />
        </animateMotion>
        <animate
          attributeName="opacity"
          values="0;0.5;0.5;0"
          keyTimes="0;0.15;0.85;1"
          dur="5s"
          repeatCount="indefinite"
        />
      </circle>
    </g>
  );
}

export const IntegrationEdge = memo(IntegrationEdgeComponent);
