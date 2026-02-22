/**
 * Flow Graph Constants
 *
 * Full idea-to-production pipeline with 3 horizontal lanes:
 *   Lane 1 (top):    Pre-production — signal intake, triage, planning, decomposition, launch
 *   Lane 2 (middle): Production engine — lead engineer, auto-mode, agent execution, git, PR
 *   Lane 3 (bottom): Feature pipeline stages — backlog, in progress, review, done, blocked
 *
 * Integrations (GitHub, Linear, Discord) sit in a right sidebar.
 * Reflection node at the bottom completes the feedback loop.
 */

import type { PipelinePhase } from '@automaker/types';
import type { FlowEdge, PipelineStageId, EngineServiceId } from './types';

// ============================================
// Static Node IDs
// ============================================

export const NODE_IDS = {
  // Pre-production pipeline (Lane 1)
  signalSources: 'engine-signal-sources',
  triage: 'engine-triage',
  projectPlanning: 'engine-project-planning',
  decomposition: 'engine-decomposition',
  launch: 'engine-launch',
  // Production engine (Lane 2)
  leadEngineerRules: 'engine-lead-engineer-rules',
  autoMode: 'engine-auto-mode',
  agentExecution: 'engine-agent-execution',
  gitWorkflow: 'engine-git-workflow',
  prFeedback: 'engine-pr-feedback',
  // GTM content pipeline (branches from triage)
  contentPipeline: 'engine-content-pipeline',
  // Reflection (bottom)
  reflection: 'engine-reflection',
  // Integrations (right sidebar)
  github: 'integration-github',
  linear: 'integration-linear',
  discord: 'integration-discord',
  // Pipeline stages (Lane 3)
  pipelineBacklog: 'pipeline-backlog',
  pipelineInProgress: 'pipeline-in-progress',
  pipelineReview: 'pipeline-review',
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
  // Lane 1: Pre-production pipeline (y=50)
  {
    nodeId: NODE_IDS.signalSources,
    serviceId: 'signal-sources',
    label: 'Signal Sources',
    position: { x: 100, y: 50 },
  },
  {
    nodeId: NODE_IDS.triage,
    serviceId: 'triage',
    label: 'Triage & Routing',
    position: { x: 350, y: 50 },
  },
  {
    nodeId: NODE_IDS.projectPlanning,
    serviceId: 'project-planning',
    label: 'Project Planning',
    position: { x: 600, y: 50 },
  },
  {
    nodeId: NODE_IDS.decomposition,
    serviceId: 'decomposition',
    label: 'Decomposition',
    position: { x: 850, y: 50 },
  },
  {
    nodeId: NODE_IDS.launch,
    serviceId: 'launch',
    label: 'Launch',
    position: { x: 1100, y: 50 },
  },

  // Lane 2: Production engine (y=280)
  {
    nodeId: NODE_IDS.leadEngineerRules,
    serviceId: 'lead-engineer-rules',
    label: 'Lead Engineer',
    position: { x: 100, y: 280 },
  },
  {
    nodeId: NODE_IDS.autoMode,
    serviceId: 'auto-mode',
    label: 'Auto-Mode',
    position: { x: 350, y: 280 },
  },
  {
    nodeId: NODE_IDS.agentExecution,
    serviceId: 'agent-execution',
    label: 'Agent Execution',
    position: { x: 600, y: 280 },
  },
  {
    nodeId: NODE_IDS.gitWorkflow,
    serviceId: 'git-workflow',
    label: 'Git Workflow',
    position: { x: 850, y: 280 },
  },
  {
    nodeId: NODE_IDS.prFeedback,
    serviceId: 'pr-feedback',
    label: 'PR Pipeline',
    position: { x: 1100, y: 280 },
  },

  // GTM branch (above Lane 1, forking from triage)
  {
    nodeId: NODE_IDS.contentPipeline,
    serviceId: 'content-pipeline',
    label: 'Content Pipeline',
    position: { x: 475, y: -70 },
  },

  // Reflection (bottom, y=840)
  {
    nodeId: NODE_IDS.reflection,
    serviceId: 'reflection',
    label: 'Reflection Loop',
    position: { x: 600, y: 840 },
  },
];

// ============================================
// Integration Node Positions (right sidebar)
// ============================================

export const INTEGRATION_POSITIONS: Record<string, { x: number; y: number }> = {
  [NODE_IDS.github]: { x: 1400, y: 50 },
  [NODE_IDS.linear]: { x: 1400, y: 170 },
  [NODE_IDS.discord]: { x: 1400, y: 290 },
};

// Dynamic feature/agent zone starts below reflection
export const DYNAMIC_ZONE_START_Y = 1000;
export const DYNAMIC_ZONE_CENTER_X = 600;

// ============================================
// Static Edge Definitions
// ============================================

export const STATIC_EDGES: FlowEdge[] = [
  // --- Lane 1: Pre-production flow (left to right) ---
  {
    id: 'e-sources-triage',
    source: NODE_IDS.signalSources,
    target: NODE_IDS.triage,
    type: 'workflow',
  },
  {
    id: 'e-triage-planning',
    source: NODE_IDS.triage,
    target: NODE_IDS.projectPlanning,
    type: 'workflow',
  },
  {
    id: 'e-planning-decomp',
    source: NODE_IDS.projectPlanning,
    target: NODE_IDS.decomposition,
    type: 'workflow',
  },
  {
    id: 'e-decomp-launch',
    source: NODE_IDS.decomposition,
    target: NODE_IDS.launch,
    type: 'workflow',
  },

  // --- GTM branch: triage -> content pipeline ---
  {
    id: 'e-triage-content',
    source: NODE_IDS.triage,
    target: NODE_IDS.contentPipeline,
    type: 'workflow',
    label: 'gtm',
  },

  // --- Cross-lane: Pre-production -> Production ---
  {
    id: 'e-launch-automode',
    source: NODE_IDS.launch,
    target: NODE_IDS.autoMode,
    type: 'workflow',
  },

  // --- Lane 2: Production engine flow (left to right) ---
  {
    id: 'e-lead-automode',
    source: NODE_IDS.leadEngineerRules,
    target: NODE_IDS.autoMode,
    type: 'delegation',
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
  // Lead Engineer delegates to agent execution
  {
    id: 'e-lead-agent',
    source: NODE_IDS.leadEngineerRules,
    target: NODE_IDS.agentExecution,
    type: 'delegation',
  },

  // --- Integration edges ---
  // Inbound: integrations feed into signal sources
  {
    id: 'e-linear-sources',
    source: NODE_IDS.linear,
    target: NODE_IDS.signalSources,
    type: 'integration',
  },
  {
    id: 'e-github-sources',
    source: NODE_IDS.github,
    target: NODE_IDS.signalSources,
    type: 'integration',
  },
  {
    id: 'e-discord-sources',
    source: NODE_IDS.discord,
    target: NODE_IDS.signalSources,
    type: 'integration',
  },
  // Outbound: services push to integrations
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
    id: 'e-lead-discord',
    source: NODE_IDS.leadEngineerRules,
    target: NODE_IDS.discord,
    type: 'integration',
  },

  // --- Reflection loop ---
  {
    id: 'e-done-reflection',
    source: NODE_IDS.pipelineDone,
    target: NODE_IDS.reflection,
    type: 'workflow',
  },
  {
    id: 'e-reflection-sources',
    source: NODE_IDS.reflection,
    target: NODE_IDS.signalSources,
    type: 'workflow',
    label: 'feedback',
  },
];

// ============================================
// Pipeline Stages (Lane 3, y=510)
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
    position: { x: 100, y: 510 },
  },
  {
    nodeId: NODE_IDS.pipelineInProgress,
    stageId: 'in_progress',
    label: 'In Progress',
    position: { x: 350, y: 510 },
  },
  {
    nodeId: NODE_IDS.pipelineReview,
    stageId: 'review',
    label: 'Review',
    position: { x: 600, y: 510 },
  },
  {
    nodeId: NODE_IDS.pipelineDone,
    stageId: 'done',
    label: 'Done',
    position: { x: 850, y: 510 },
  },
  {
    nodeId: NODE_IDS.pipelineBlocked,
    stageId: 'blocked',
    label: 'Blocked',
    position: { x: 600, y: 620 },
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
    id: 'e-pipe-review-done',
    source: NODE_IDS.pipelineReview,
    target: NODE_IDS.pipelineDone,
    type: 'pipeline',
  },
  {
    id: 'e-pipe-review-blocked',
    source: NODE_IDS.pipelineReview,
    sourceHandle: 'bottom',
    target: NODE_IDS.pipelineBlocked,
    targetHandle: 'top',
    type: 'pipeline',
  },
];

// Bridge edges: production services -> pipeline stages
export const BRIDGE_EDGES: FlowEdge[] = [
  {
    id: 'e-bridge-launch-backlog',
    source: NODE_IDS.launch,
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
    id: 'e-bridge-git-done',
    source: NODE_IDS.gitWorkflow,
    target: NODE_IDS.pipelineDone,
    type: 'workflow',
  },
];

// ============================================
// Pipeline Phase → Engine Service Node Mapping
// ============================================

/** Maps unified pipeline phases to the engine service node they correspond to */
export const PIPELINE_PHASE_TO_SERVICE: Record<
  PipelinePhase,
  { ops: EngineServiceId; gtm: EngineServiceId }
> = {
  TRIAGE: { ops: 'triage', gtm: 'triage' },
  RESEARCH: { ops: 'signal-sources', gtm: 'content-pipeline' },
  SPEC: { ops: 'project-planning', gtm: 'content-pipeline' },
  SPEC_REVIEW: { ops: 'project-planning', gtm: 'content-pipeline' },
  DESIGN: { ops: 'decomposition', gtm: 'content-pipeline' },
  PLAN: { ops: 'launch', gtm: 'content-pipeline' },
  EXECUTE: { ops: 'agent-execution', gtm: 'content-pipeline' },
  VERIFY: { ops: 'pr-feedback', gtm: 'content-pipeline' },
  PUBLISH: { ops: 'git-workflow', gtm: 'content-pipeline' },
};
