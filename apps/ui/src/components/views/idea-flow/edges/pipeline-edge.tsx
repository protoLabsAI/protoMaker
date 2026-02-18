/**
 * Pipeline Edge — Status-driven animated edge for idea flow pipeline
 *
 * Visual states:
 * - active: blue gradient + fast particles
 * - completed: emerald + slow particles
 * - pending: gray dashed (no particles)
 * - skipped: gray dotted 30% opacity (no particles)
 * - error: red (no particles)
 *
 * Uses SVG <animateMotion> with <mpath> to move circles along the edge path.
 */

import { memo, useId } from 'react';
import { getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { StepStatus } from '../types';

function PipelineEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const uid = useId();
  const gradientId = `pipeline-gradient-${uid}`;
  const pathId = `pipeline-path-${id}`;

  // Extract status from edge data (passed from parent component)
  // Type assertion needed because EdgeProps data is Record<string, unknown>
  const status = (data as { status?: StepStatus })?.status || 'pending';

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  // Status-driven styling
  const getStrokeStyle = () => {
    switch (status) {
      case 'active':
        return {
          stroke: `url(#${gradientId})`,
          strokeWidth: 1.5,
          strokeDasharray: 'none',
          opacity: 1,
        };
      case 'completed':
        return {
          stroke: 'oklch(0.65 0.15 160)', // emerald
          strokeWidth: 1.5,
          strokeDasharray: 'none',
          opacity: 1,
        };
      case 'pending':
        return {
          stroke: 'oklch(0.5 0.02 270)', // gray
          strokeWidth: 1.5,
          strokeDasharray: '5,5',
          opacity: 0.6,
        };
      case 'skipped':
        return {
          stroke: 'oklch(0.5 0.02 270)', // gray
          strokeWidth: 1.5,
          strokeDasharray: '2,4',
          opacity: 0.3,
        };
      case 'error':
        return {
          stroke: 'oklch(0.6 0.2 25)', // red
          strokeWidth: 1.5,
          strokeDasharray: 'none',
          opacity: 1,
        };
      default:
        return {
          stroke: 'oklch(0.5 0.02 270)',
          strokeWidth: 1.5,
          strokeDasharray: '5,5',
          opacity: 0.6,
        };
    }
  };

  const strokeStyle = getStrokeStyle();
  const showParticles = status === 'active' || status === 'completed';
  const particleSpeed = status === 'active' ? '2.5s' : '5s'; // slower for completed

  return (
    <g>
      {status === 'active' && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="oklch(0.6 0.18 240)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="oklch(0.6 0.18 260)" stopOpacity={0.5} />
          </linearGradient>
        </defs>
      )}

      {/* Background glow (only for active/completed) */}
      {(status === 'active' || status === 'completed') && (
        <path
          d={edgePath}
          fill="none"
          stroke={
            status === 'active' ? 'oklch(0.6 0.18 250 / 0.06)' : 'oklch(0.65 0.15 160 / 0.06)'
          }
          strokeWidth={8}
          strokeLinecap="round"
        />
      )}

      {/* Base path */}
      <path
        id={pathId}
        d={edgePath}
        fill="none"
        stroke={strokeStyle.stroke}
        strokeWidth={strokeStyle.strokeWidth}
        strokeDasharray={strokeStyle.strokeDasharray}
        strokeLinecap="round"
        opacity={strokeStyle.opacity}
      />

      {/* Animated particles (only for active/completed) */}
      {showParticles && (
        <>
          {/* Particle 1 */}
          <circle
            r="3"
            fill={
              status === 'active' ? 'oklch(0.7 0.2 250)' : 'oklch(0.7 0.15 160)' // emerald particle
            }
            opacity={0.8}
          >
            <animateMotion dur={particleSpeed} repeatCount="indefinite">
              <mpath href={`#${pathId}`} />
            </animateMotion>
            <animate
              attributeName="opacity"
              values="0;0.8;0.8;0"
              keyTimes="0;0.1;0.8;1"
              dur={particleSpeed}
              repeatCount="indefinite"
            />
          </circle>

          {/* Particle 2 (offset timing) */}
          <circle
            r="2"
            fill={
              status === 'active' ? 'oklch(0.65 0.2 260)' : 'oklch(0.65 0.15 165)' // slightly different emerald
            }
            opacity={0.6}
          >
            <animateMotion
              dur={particleSpeed}
              repeatCount="indefinite"
              begin={status === 'active' ? '1.25s' : '2.5s'}
            >
              <mpath href={`#${pathId}`} />
            </animateMotion>
            <animate
              attributeName="opacity"
              values="0;0.6;0.6;0"
              keyTimes="0;0.1;0.8;1"
              dur={particleSpeed}
              repeatCount="indefinite"
              begin={status === 'active' ? '1.25s' : '2.5s'}
            />
          </circle>
        </>
      )}
    </g>
  );
}

export const PipelineEdge = memo(PipelineEdgeComponent);
