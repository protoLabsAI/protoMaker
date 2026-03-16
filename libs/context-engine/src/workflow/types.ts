/**
 * Types for the durable workflow checkpoint store.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type WorkflowState = 'pending' | 'running' | 'suspended' | 'completed' | 'failed';

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface WorkflowExecution {
  id: string;
  featureId: string;
  state: WorkflowState;
  /** Monotonically increasing version for optimistic locking */
  version: number;
  /** Arbitrary JSON checkpoint data */
  checkpointData: unknown;
  createdAt: string;
  updatedAt: string;
  suspendedAt: string | null;
}

export interface WorkflowStep {
  id: string;
  workflowId: string;
  stepName: string;
  state: WorkflowState;
  /** Arbitrary JSON input to the step */
  input: unknown;
  /** Arbitrary JSON output from the step */
  output: unknown;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Input / query types
// ---------------------------------------------------------------------------

export interface CreateWorkflowInput {
  featureId: string;
  checkpointData?: unknown;
}

export interface UpdateWorkflowStateInput {
  id: string;
  newState: WorkflowState;
  checkpointData?: unknown;
  /** If provided, the transition is rejected unless the current version matches */
  expectedVersion?: number;
}

export interface WorkflowQuery {
  featureId?: string;
  state?: WorkflowState;
}
