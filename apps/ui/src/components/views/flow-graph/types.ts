/**
 * Flow Graph Types
 *
 * Node/edge type definitions and brand constants for the system flow graph.
 */

import type { Node, Edge } from '@xyflow/react';

// ============================================
// Node Data Types
// ============================================

export interface OrchestratorNodeData {
  label: string;
  status: 'active' | 'idle' | 'error';
  agentCount: number;
  featureCount: number;
  autoModeRunning: boolean;
  [key: string]: unknown;
}

export interface CrewNodeData {
  id: string;
  label: string;
  enabled: boolean;
  isRunning: boolean;
  lastCheckTime: string | null;
  lastSeverity: string | null;
  [key: string]: unknown;
}

export interface ServiceNodeData {
  label: string;
  serviceType: 'auto-mode' | 'lead-engineer';
  running: boolean;
  queueDepth: number;
  [key: string]: unknown;
}

export interface IntegrationNodeData {
  label: string;
  integrationType: 'github' | 'linear' | 'discord';
  connected: boolean;
  status: string;
  [key: string]: unknown;
}

export interface FeatureNodeData {
  featureId: string;
  title: string;
  status: string;
  branchName?: string;
  progress?: number;
  [key: string]: unknown;
}

export interface AgentNodeData {
  featureId: string;
  title: string;
  model?: string;
  startTime: number;
  isAutoMode: boolean;
  [key: string]: unknown;
}

// ============================================
// Typed Node/Edge Aliases
// ============================================

export type OrchestratorNode = Node<OrchestratorNodeData, 'orchestrator'>;
export type CrewNode = Node<CrewNodeData, 'crew'>;
export type ServiceNode = Node<ServiceNodeData, 'service'>;
export type IntegrationNode = Node<IntegrationNodeData, 'integration'>;
export type FeatureNode = Node<FeatureNodeData, 'feature'>;
export type AgentNode = Node<AgentNodeData, 'agent'>;

export type FlowNode =
  | OrchestratorNode
  | CrewNode
  | ServiceNode
  | IntegrationNode
  | FeatureNode
  | AgentNode;

export type DelegationEdge = Edge & { type: 'delegation' };
export type WorkflowEdge = Edge & { type: 'workflow' };
export type IntegrationEdge = Edge & { type: 'integration' };

export type FlowEdge = DelegationEdge | WorkflowEdge | IntegrationEdge;

// ============================================
// Brand Constants
// ============================================

export const FLOW_COLORS = {
  violet: {
    primary: 'oklch(0.65 0.2 290)',
    glow: 'oklch(0.65 0.2 290 / 0.3)',
    muted: 'oklch(0.65 0.2 290 / 0.15)',
  },
  status: {
    success: 'var(--status-success)',
    warning: 'var(--status-warning)',
    error: 'var(--status-error)',
    info: 'var(--status-info)',
  },
  node: {
    bg: 'var(--card)',
    border: 'var(--border)',
    text: 'var(--card-foreground)',
    muted: 'var(--muted-foreground)',
  },
} as const;

export const NODE_DIMENSIONS = {
  orchestrator: { width: 320, height: 160 },
  crew: { width: 200, height: 100 },
  service: { width: 200, height: 100 },
  integration: { width: 160, height: 80 },
  feature: { width: 180, height: 80 },
  agent: { width: 160, height: 70 },
} as const;
