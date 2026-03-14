/**
 * Flow Graph Constants
 *
 * Simplified 2-lane system view:
 *   Lane 1 (production): Lead Engineer, Auto-Mode, Agent Execution, Git Workflow, PR Pipeline
 *   Sidebar (right):     GitHub integration, Discord integration
 */

import type { FlowEdge, EngineServiceId } from './types';

// ============================================
// Static Node IDs
// ============================================

export const NODE_IDS = {
  // Production lane (Lane 1)
  leadEngineerRules: 'engine-lead-engineer-rules',
  autoMode: 'engine-auto-mode',
  agentExecution: 'engine-agent-execution',
  gitWorkflow: 'engine-git-workflow',
  prFeedback: 'engine-pr-feedback',
  // Integrations (right sidebar)
  github: 'integration-github',
  discord: 'integration-discord',
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
  // Lane 1: Production engine (y=100)
  {
    nodeId: NODE_IDS.leadEngineerRules,
    serviceId: 'lead-engineer-rules',
    label: 'Lead Engineer',
    position: { x: 100, y: 100 },
  },
  {
    nodeId: NODE_IDS.autoMode,
    serviceId: 'auto-mode',
    label: 'Auto-Mode',
    position: { x: 350, y: 100 },
  },
  {
    nodeId: NODE_IDS.agentExecution,
    serviceId: 'agent-execution',
    label: 'Agent Execution',
    position: { x: 600, y: 100 },
  },
  {
    nodeId: NODE_IDS.gitWorkflow,
    serviceId: 'git-workflow',
    label: 'Git Workflow',
    position: { x: 850, y: 100 },
  },
  {
    nodeId: NODE_IDS.prFeedback,
    serviceId: 'pr-feedback',
    label: 'PR Pipeline',
    position: { x: 1100, y: 100 },
  },
];

// ============================================
// Integration Node Positions (right sidebar)
// ============================================

export const INTEGRATION_POSITIONS: Record<string, { x: number; y: number }> = {
  [NODE_IDS.github]: { x: 1400, y: 50 },
  [NODE_IDS.discord]: { x: 1400, y: 170 },
};

// Dynamic feature/agent zone starts below the production lane
export const DYNAMIC_ZONE_START_Y = 400;
export const DYNAMIC_ZONE_CENTER_X = 600;

// ============================================
// Static Edge Definitions
// ============================================

export const STATIC_EDGES: FlowEdge[] = [
  // --- Production lane flow (left to right) ---
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

  // --- Integration edges ---
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
];
