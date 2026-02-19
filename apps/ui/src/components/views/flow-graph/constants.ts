/**
 * Flow Graph Constants
 *
 * Real engine topology: left-to-right service flow with pipeline stages below.
 * Services represent actual runtime components; integrations are external systems.
 * Dynamic nodes (features, agents) attach to their current pipeline stage.
 */

import type { FlowEdge, PipelineStageId, EngineServiceId } from './types';

// ============================================
// Static Node IDs
// ============================================

export const NODE_IDS = {
  // Engine services (left-to-right flow)
  signalIntake: 'engine-signal-intake',
  autoMode: 'engine-auto-mode',
  agentExecution: 'engine-agent-execution',
  gitWorkflow: 'engine-git-workflow',
  prFeedback: 'engine-pr-feedback',
  leadEngineerRules: 'engine-lead-engineer-rules',
  // Integrations (external systems)
  github: 'integration-github',
  linear: 'integration-linear',
  discord: 'integration-discord',
  // Pipeline stages
  pipelineBacklog: 'pipeline-backlog',
  pipelineInProgress: 'pipeline-in-progress',
  pipelineReview: 'pipeline-review',
  pipelineMerge: 'pipeline-merge',
  pipelineTest: 'pipeline-test',
  pipelineVerify: 'pipeline-verify',
  pipelineDone: 'pipeline-done',
  pipelineBlocked: 'pipeline-blocked',
} as const;

// ============================================
// Engine Service Definitions
// ============================================

export const ENGINE_SERVICES: Array<{
  nodeId: string;
  serviceId: EngineServiceId;
  label: string;
  position: { x: number; y: number };
}> = [
  {
    nodeId: NODE_IDS.signalIntake,
    serviceId: 'signal-intake',
    label: 'Signal Intake',
    position: { x: 100, y: 200 },
  },
  {
    nodeId: NODE_IDS.autoMode,
    serviceId: 'auto-mode',
    label: 'Auto-Mode',
    position: { x: 400, y: 200 },
  },
  {
    nodeId: NODE_IDS.agentExecution,
    serviceId: 'agent-execution',
    label: 'Agent Execution',
    position: { x: 700, y: 200 },
  },
  {
    nodeId: NODE_IDS.gitWorkflow,
    serviceId: 'git-workflow',
    label: 'Git Workflow',
    position: { x: 1000, y: 200 },
  },
  {
    nodeId: NODE_IDS.prFeedback,
    serviceId: 'pr-feedback',
    label: 'PR Feedback',
    position: { x: 1300, y: 200 },
  },
  {
    nodeId: NODE_IDS.leadEngineerRules,
    serviceId: 'lead-engineer-rules',
    label: 'Lead Engineer',
    position: { x: 700, y: 50 },
  },
];

// ============================================
// Integration Node Positions
// ============================================

export const INTEGRATION_POSITIONS: Record<string, { x: number; y: number }> = {
  [NODE_IDS.github]: { x: 1150, y: 50 },
  [NODE_IDS.linear]: { x: 1350, y: 50 },
  [NODE_IDS.discord]: { x: 1550, y: 50 },
};

// Dynamic feature/agent zone starts below pipeline
export const DYNAMIC_ZONE_START_Y = 750;
export const DYNAMIC_ZONE_CENTER_X = 700;

// ============================================
// Static Edge Definitions (real service flow)
// ============================================

export const STATIC_EDGES: FlowEdge[] = [
  // Main pipeline flow: left to right
  {
    id: 'e-signal-automode',
    source: NODE_IDS.signalIntake,
    target: NODE_IDS.autoMode,
    type: 'workflow',
  },
  {
    id: 'e-automode-agent',
    source: NODE_IDS.autoMode,
    target: NODE_IDS.agentExecution,
    type: 'workflow',
  },
  {
    id: 'e-agent-git',
    source: NODE_IDS.agentExecution,
    target: NODE_IDS.gitWorkflow,
    type: 'workflow',
  },
  {
    id: 'e-git-prfeedback',
    source: NODE_IDS.gitWorkflow,
    target: NODE_IDS.prFeedback,
    type: 'workflow',
  },
  // PR feedback remediation loop back to agent execution
  {
    id: 'e-prfeedback-agent',
    source: NODE_IDS.prFeedback,
    target: NODE_IDS.agentExecution,
    type: 'workflow',
    label: 'remediation',
  },

  // Lead Engineer subscribes to all events (shown connected to key services)
  {
    id: 'e-lead-automode',
    source: NODE_IDS.leadEngineerRules,
    target: NODE_IDS.autoMode,
    type: 'delegation',
  },
  {
    id: 'e-lead-agent',
    source: NODE_IDS.leadEngineerRules,
    target: NODE_IDS.agentExecution,
    type: 'delegation',
  },

  // Integration edges: services -> external systems
  {
    id: 'e-git-github',
    source: NODE_IDS.gitWorkflow,
    target: NODE_IDS.github,
    type: 'integration',
  },
  {
    id: 'e-prfeedback-github',
    source: NODE_IDS.prFeedback,
    target: NODE_IDS.github,
    type: 'integration',
  },
  {
    id: 'e-signal-linear',
    source: NODE_IDS.signalIntake,
    target: NODE_IDS.linear,
    type: 'integration',
  },
  {
    id: 'e-lead-discord',
    source: NODE_IDS.leadEngineerRules,
    target: NODE_IDS.discord,
    type: 'integration',
  },
];

// ============================================
// Pipeline Stages
// ============================================

export const PIPELINE_STAGES: Array<{
  nodeId: string;
  stageId: PipelineStageId;
  label: string;
  position: { x: number; y: number };
}> = [
  {
    nodeId: NODE_IDS.pipelineBacklog,
    stageId: 'backlog',
    label: 'Backlog',
    position: { x: 100, y: 450 },
  },
  {
    nodeId: NODE_IDS.pipelineInProgress,
    stageId: 'in_progress',
    label: 'In Progress',
    position: { x: 350, y: 450 },
  },
  {
    nodeId: NODE_IDS.pipelineReview,
    stageId: 'review',
    label: 'Review',
    position: { x: 600, y: 450 },
  },
  {
    nodeId: NODE_IDS.pipelineMerge,
    stageId: 'merge',
    label: 'Merge',
    position: { x: 850, y: 450 },
  },
  {
    nodeId: NODE_IDS.pipelineTest,
    stageId: 'test',
    label: 'Test',
    position: { x: 1100, y: 450 },
  },
  {
    nodeId: NODE_IDS.pipelineVerify,
    stageId: 'verify',
    label: 'Verify',
    position: { x: 1350, y: 450 },
  },
  {
    nodeId: NODE_IDS.pipelineDone,
    stageId: 'done',
    label: 'Done',
    position: { x: 1600, y: 450 },
  },
  {
    nodeId: NODE_IDS.pipelineBlocked,
    stageId: 'blocked',
    label: 'Blocked',
    position: { x: 600, y: 600 },
  },
];

// Pipeline edges connecting stages left-to-right
export const PIPELINE_EDGES: FlowEdge[] = [
  {
    id: 'e-pipe-backlog-progress',
    source: NODE_IDS.pipelineBacklog,
    target: NODE_IDS.pipelineInProgress,
    type: 'pipeline',
  },
  {
    id: 'e-pipe-progress-review',
    source: NODE_IDS.pipelineInProgress,
    target: NODE_IDS.pipelineReview,
    type: 'pipeline',
  },
  {
    id: 'e-pipe-review-merge',
    source: NODE_IDS.pipelineReview,
    target: NODE_IDS.pipelineMerge,
    type: 'pipeline',
  },
  {
    id: 'e-pipe-merge-test',
    source: NODE_IDS.pipelineMerge,
    target: NODE_IDS.pipelineTest,
    type: 'pipeline',
  },
  {
    id: 'e-pipe-test-verify',
    source: NODE_IDS.pipelineTest,
    target: NODE_IDS.pipelineVerify,
    type: 'pipeline',
  },
  {
    id: 'e-pipe-verify-done',
    source: NODE_IDS.pipelineVerify,
    target: NODE_IDS.pipelineDone,
    type: 'pipeline',
  },
  {
    id: 'e-pipe-review-blocked',
    source: NODE_IDS.pipelineReview,
    target: NODE_IDS.pipelineBlocked,
    type: 'pipeline',
  },
];

// Bridge edges: services -> pipeline stages
export const BRIDGE_EDGES: FlowEdge[] = [
  {
    id: 'e-bridge-signal-backlog',
    source: NODE_IDS.signalIntake,
    target: NODE_IDS.pipelineBacklog,
    type: 'workflow',
  },
  {
    id: 'e-bridge-automode-progress',
    source: NODE_IDS.autoMode,
    target: NODE_IDS.pipelineInProgress,
    type: 'workflow',
  },
  {
    id: 'e-bridge-prfeedback-review',
    source: NODE_IDS.prFeedback,
    target: NODE_IDS.pipelineReview,
    type: 'workflow',
  },
  {
    id: 'e-bridge-git-merge',
    source: NODE_IDS.gitWorkflow,
    target: NODE_IDS.pipelineMerge,
    type: 'workflow',
  },
];
