/**
 * Idea Flow Types
 *
 * Node/edge type definitions for the idea intake and pipeline flow.
 */

import type { Node, Edge } from '@xyflow/react';

// ============================================
// Pipeline Step Type
// ============================================

export type PipelineStep =
  | 'intake'
  | 'research'
  | 'draft-prd'
  | 'review-prd'
  | 'approve'
  | 'scaffold'
  | 'backlog';

export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'error';

// ============================================
// Node Data Types
// ============================================

export interface IntakeNodeData {
  label: string;
  description?: string;
  source?: 'manual' | 'linear' | 'discord' | 'github';
  timestamp?: string;
  [key: string]: unknown;
}

export interface PipelineStepNodeData {
  label: string;
  step: PipelineStep;
  status: StepStatus;
  assignee?: string;
  startTime?: number;
  endTime?: number;
  [key: string]: unknown;
}

export interface ApprovalNodeData {
  label: string;
  approved: boolean | null;
  approver?: string;
  approvalTime?: string;
  feedback?: string;
  [key: string]: unknown;
}

export interface TerminalNodeData {
  label: string;
  destination: 'backlog' | 'rejected' | 'archived';
  timestamp?: string;
  [key: string]: unknown;
}

export interface PipelineEdgeData {
  label?: string;
  animated?: boolean;
  [key: string]: unknown;
}

// ============================================
// Typed Node/Edge Aliases
// ============================================

export type IntakeNode = Node<IntakeNodeData, 'intake'>;
export type PipelineStepNode = Node<PipelineStepNodeData, 'pipelineStep'>;
export type ApprovalNode = Node<ApprovalNodeData, 'approval'>;
export type TerminalNode = Node<TerminalNodeData, 'terminal'>;

export type IdeaFlowNode = IntakeNode | PipelineStepNode | ApprovalNode | TerminalNode;

export type PipelineEdge = Edge<PipelineEdgeData>;
