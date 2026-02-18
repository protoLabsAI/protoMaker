/**
 * Flow Graph Constants
 *
 * Static node positions and edge topology for the system flow graph.
 * Static nodes (Ava, crew, services, integrations) use fixed positions.
 * Dynamic nodes (features, agents) use dagre layout below center.
 */

import type { FlowNode, FlowEdge, PipelineStageId } from './types';

// ============================================
// Static Node IDs
// ============================================

export const NODE_IDS = {
  ava: 'ava',
  // Crew
  frank: 'crew-frank',
  prMaintainer: 'crew-pr-maintainer',
  boardJanitor: 'crew-board-janitor',
  systemHealth: 'crew-system-health',
  // Services
  autoMode: 'service-auto-mode',
  leadEngineer: 'service-lead-engineer',
  // Integrations
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
// Static Positions (manual layout)
// ============================================

const CENTER = { x: 600, y: 350 };

export const STATIC_POSITIONS: Record<string, { x: number; y: number }> = {
  // Ava - center
  [NODE_IDS.ava]: CENTER,

  // Crew - inner ring (~180px from center)
  [NODE_IDS.frank]: { x: CENTER.x - 250, y: CENTER.y - 130 },
  [NODE_IDS.prMaintainer]: { x: CENTER.x + 250, y: CENTER.y - 130 },
  [NODE_IDS.boardJanitor]: { x: CENTER.x - 250, y: CENTER.y + 130 },
  [NODE_IDS.systemHealth]: { x: CENTER.x + 250, y: CENTER.y + 130 },

  // Services - mid ring (~300px from center)
  [NODE_IDS.autoMode]: { x: CENTER.x - 420, y: CENTER.y },
  [NODE_IDS.leadEngineer]: { x: CENTER.x + 420, y: CENTER.y },

  // Integrations - top outer corners
  [NODE_IDS.github]: { x: CENTER.x - 350, y: CENTER.y - 300 },
  [NODE_IDS.linear]: { x: CENTER.x, y: CENTER.y - 320 },
  [NODE_IDS.discord]: { x: CENTER.x + 350, y: CENTER.y - 300 },
};

// Dynamic feature/agent zone starts below Ava
export const DYNAMIC_ZONE_START_Y = CENTER.y + 250;
export const DYNAMIC_ZONE_CENTER_X = CENTER.x;

// ============================================
// Static Edge Definitions
// ============================================

export const STATIC_EDGES: FlowEdge[] = [
  // Ava -> Crew (delegation)
  { id: 'e-ava-frank', source: NODE_IDS.ava, target: NODE_IDS.frank, type: 'delegation' },
  {
    id: 'e-ava-pr-maintainer',
    source: NODE_IDS.ava,
    target: NODE_IDS.prMaintainer,
    type: 'delegation',
  },
  {
    id: 'e-ava-board-janitor',
    source: NODE_IDS.ava,
    target: NODE_IDS.boardJanitor,
    type: 'delegation',
  },
  {
    id: 'e-ava-system-health',
    source: NODE_IDS.ava,
    target: NODE_IDS.systemHealth,
    type: 'delegation',
  },

  // Ava -> Services (delegation)
  { id: 'e-ava-auto-mode', source: NODE_IDS.ava, target: NODE_IDS.autoMode, type: 'delegation' },
  {
    id: 'e-ava-lead-eng',
    source: NODE_IDS.ava,
    target: NODE_IDS.leadEngineer,
    type: 'delegation',
  },

  // Services -> Integrations (integration edges)
  {
    id: 'e-auto-mode-github',
    source: NODE_IDS.autoMode,
    target: NODE_IDS.github,
    type: 'integration',
  },
  {
    id: 'e-lead-eng-linear',
    source: NODE_IDS.leadEngineer,
    target: NODE_IDS.linear,
    type: 'integration',
  },
  {
    id: 'e-lead-eng-discord',
    source: NODE_IDS.leadEngineer,
    target: NODE_IDS.discord,
    type: 'integration',
  },

  // PR Maintainer -> GitHub
  {
    id: 'e-pr-maint-github',
    source: NODE_IDS.prMaintainer,
    target: NODE_IDS.github,
    type: 'integration',
  },
];

// ============================================
// Crew member ID -> display name mapping
// ============================================

export const CREW_DISPLAY_NAMES: Record<string, string> = {
  ava: 'Ava',
  frank: 'Frank',
  'pr-maintainer': 'PR Maintainer',
  'board-janitor': 'Board Janitor',
  'system-health': 'System Health',
  gtm: 'GTM',
};

export const CREW_NODE_ID_MAP: Record<string, string> = {
  frank: NODE_IDS.frank,
  'pr-maintainer': NODE_IDS.prMaintainer,
  'board-janitor': NODE_IDS.boardJanitor,
  'system-health': NODE_IDS.systemHealth,
};

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
    position: { x: 100, y: 800 },
  },
  {
    nodeId: NODE_IDS.pipelineInProgress,
    stageId: 'in_progress',
    label: 'In Progress',
    position: { x: 350, y: 800 },
  },
  {
    nodeId: NODE_IDS.pipelineReview,
    stageId: 'review',
    label: 'Review',
    position: { x: 600, y: 800 },
  },
  {
    nodeId: NODE_IDS.pipelineMerge,
    stageId: 'merge',
    label: 'Merge',
    position: { x: 850, y: 800 },
  },
  {
    nodeId: NODE_IDS.pipelineTest,
    stageId: 'test',
    label: 'Test',
    position: { x: 1100, y: 800 },
  },
  {
    nodeId: NODE_IDS.pipelineVerify,
    stageId: 'verify',
    label: 'Verify',
    position: { x: 1350, y: 800 },
  },
  {
    nodeId: NODE_IDS.pipelineDone,
    stageId: 'done',
    label: 'Done',
    position: { x: 1600, y: 800 },
  },
  {
    nodeId: NODE_IDS.pipelineBlocked,
    stageId: 'blocked',
    label: 'Blocked',
    position: { x: 600, y: 950 },
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
