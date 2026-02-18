/**
 * useIdeaFlowData — Main adapter hook
 *
 * Transforms ideation sessions into React Flow nodes and edges.
 * Implements lane-based layout where:
 * - Each session gets a row (lane)
 * - Pipeline steps are columns (intake → research → draft-prd → etc.)
 * - Branching topology is handled (research vs fast_path at same column)
 */

import { useMemo, useState, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { IdeationSession } from '@automaker/types';
import { useIdeaSessions } from './use-idea-sessions';
import type {
  PipelineStep,
  IntakeNodeData,
  PipelineStepNodeData,
  IdeaFlowNode,
  PipelineEdge,
} from '../types';

// Layout constants
const LANE_HEIGHT = 200;
const STEP_WIDTH = 250;
const STEP_SPACING = 100;
const LANE_PADDING = 50;
const NODE_HEIGHT = 80;

// Pipeline step order
const PIPELINE_STEPS: PipelineStep[] = [
  'intake',
  'research',
  'draft-prd',
  'review-prd',
  'approve',
  'scaffold',
  'backlog',
];

// Column positions for each step
const STEP_COLUMNS: Record<PipelineStep, number> = {
  intake: 0,
  research: 1,
  'draft-prd': 2,
  'review-prd': 3,
  approve: 4,
  scaffold: 5,
  backlog: 6,
};

/**
 * Calculate node position in the lane layout
 */
function getNodePosition(laneIndex: number, columnIndex: number) {
  return {
    x: LANE_PADDING + columnIndex * (STEP_WIDTH + STEP_SPACING),
    y: LANE_PADDING + laneIndex * LANE_HEIGHT + (LANE_HEIGHT - NODE_HEIGHT) / 2,
  };
}

/**
 * Determine current pipeline step for a session
 */
function getCurrentStep(session: IdeationSession): PipelineStep {
  // Map session status to pipeline step
  if (session.status === 'active') {
    // Active sessions are in the research phase
    return 'research';
  } else if (session.status === 'completed') {
    // Completed sessions have reached backlog
    return 'backlog';
  } else {
    // Abandoned sessions stay at intake
    return 'intake';
  }
}

/**
 * Main hook for idea flow visualization data
 *
 * @param projectPath - Current project path
 * @returns nodes, edges, selectedSession, and selectSession callback
 *
 * @example
 * ```tsx
 * const { nodes, edges, selectedSession, selectSession } = useIdeaFlowData(projectPath);
 * return <ReactFlow nodes={nodes} edges={edges} />;
 * ```
 */
export function useIdeaFlowData(projectPath: string | undefined) {
  const { data, isLoading, error } = useIdeaSessions(projectPath);
  const sessions = data?.sessions ?? [];

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Find selected session
  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  // Select session callback
  const selectSession = useCallback((sessionId: string | null) => {
    setSelectedSessionId(sessionId);
  }, []);

  // Generate nodes
  const nodes = useMemo(() => {
    const result: Node[] = [];

    sessions.forEach((session, laneIndex) => {
      const currentStep = getCurrentStep(session);
      const currentStepIndex = PIPELINE_STEPS.indexOf(currentStep);

      // Create nodes for each step up to and including the current step
      PIPELINE_STEPS.forEach((step, stepIndex) => {
        if (stepIndex > currentStepIndex) return; // Skip future steps

        const columnIndex = STEP_COLUMNS[step];
        const position = getNodePosition(laneIndex, columnIndex);
        const nodeId = `${session.id}-${step}`;

        // Determine node status
        const isCurrentStep = stepIndex === currentStepIndex;
        const isPastStep = stepIndex < currentStepIndex;
        const status = isPastStep ? 'completed' : isCurrentStep ? 'active' : 'pending';

        if (step === 'intake') {
          // Intake node (entry point)
          const intakeData: IntakeNodeData = {
            label: 'Intake',
            description: session.promptCategory,
            source: 'manual',
            timestamp: session.createdAt,
          };
          result.push({
            id: nodeId,
            type: 'intake',
            position,
            data: intakeData,
            draggable: false,
          });
        } else {
          // Pipeline step node
          const stepData: PipelineStepNodeData = {
            label: step.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            step,
            status,
            assignee: 'Ava', // Default assignee
          };
          result.push({
            id: nodeId,
            type: 'pipelineStep',
            position,
            data: stepData,
            draggable: false,
          });
        }
      });
    });

    return result;
  }, [sessions]);

  // Generate edges
  const edges = useMemo(() => {
    const result: Edge[] = [];

    sessions.forEach((session, laneIndex) => {
      const currentStep = getCurrentStep(session);
      const currentStepIndex = PIPELINE_STEPS.indexOf(currentStep);

      // Create edges between consecutive steps
      for (let i = 0; i < currentStepIndex; i++) {
        const sourceStep = PIPELINE_STEPS[i];
        const targetStep = PIPELINE_STEPS[i + 1];

        const edgeId = `${session.id}-${sourceStep}-${targetStep}`;
        const sourceId = `${session.id}-${sourceStep}`;
        const targetId = `${session.id}-${targetStep}`;

        result.push({
          id: edgeId,
          source: sourceId,
          target: targetId,
          type: 'smoothstep',
          animated: false,
        });
      }

      // Handle branching topology: research can branch into fast_path or standard path
      // For now, we assume a linear flow. Future implementation can add branching logic here
      // by checking session metadata for branch indicators.
    });

    return result;
  }, [sessions]);

  return {
    nodes,
    edges,
    selectedSession,
    selectSession,
    isLoading,
    error,
  };
}
