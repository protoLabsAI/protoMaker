/**
 * Shared types for the AutoMode service modules.
 *
 * These interfaces define the internal state structures used across
 * the scheduler, executor, health monitor, and lifecycle modules.
 */

import type {
  Feature,
  ModelProvider,
  PipelineStep,
  PipelineConfig,
  PlanningMode,
} from '@automaker/types';

export interface ParsedTask {
  id: string; // e.g., "T001"
  description: string; // e.g., "Create user model"
  filePath?: string; // e.g., "src/models/user.ts"
  phase?: string; // e.g., "Phase 1: Foundation" (for full mode)
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface PlanSpec {
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  content?: string;
  version: number;
  generatedAt?: string;
  approvedAt?: string;
  reviewedByUser: boolean;
  tasksCompleted?: number;
  tasksTotal?: number;
  currentTaskId?: string;
  tasks?: ParsedTask[];
}

/**
 * Information about pipeline status when resuming a feature.
 * Used to determine how to handle features stuck in pipeline execution.
 */
export interface PipelineStatusInfo {
  isPipeline: boolean;
  stepId: string | null;
  stepIndex: number;
  totalSteps: number;
  step: PipelineStep | null;
  config: PipelineConfig | null;
}

export interface RunningFeature {
  featureId: string;
  projectPath: string;
  worktreePath: string | null;
  branchName: string | null;
  abortController: AbortController;
  isAutoMode: boolean;
  startTime: number;
  model?: string;
  provider?: ModelProvider;
  retryCount: number;
  previousErrors: string[];
  recoveryContext?: string;
}

export interface AutoLoopState {
  projectPath: string;
  maxConcurrency: number;
  abortController: AbortController;
  isRunning: boolean;
}

export interface PendingApproval {
  resolve: (result: { approved: boolean; editedPlan?: string; feedback?: string }) => void;
  reject: (error: Error) => void;
  featureId: string;
  projectPath: string;
}

export interface AutoModeConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
  branchName: string | null; // null = main worktree
}

/**
 * Per-worktree autoloop state for multi-project/worktree support
 */
export interface ProjectAutoLoopState {
  abortController: AbortController;
  config: AutoModeConfig;
  isRunning: boolean;
  consecutiveFailures: { timestamp: number; error: string }[];
  pausedDueToFailures: boolean;
  hasEmittedIdleEvent: boolean;
  branchName: string | null; // null = main worktree
  cooldownTimer: NodeJS.Timeout | null;
  startingFeatures: Set<string>;
}

/**
 * Execution state for recovery after server restart.
 * Tracks which features were running and auto-loop configuration.
 */
export interface ExecutionState {
  version: 1;
  autoLoopWasRunning: boolean;
  maxConcurrency: number;
  projectPath: string;
  branchName: string | null;
  runningFeatureIds: string[];
  savedAt: string;
}

// Extended type with planning fields for local use
export interface FeatureWithPlanning extends Feature {
  planningMode?: PlanningMode;
  planSpec?: PlanSpec;
  requirePlanApproval?: boolean;
}

export interface ErrorInfo {
  type: string;
  message: string;
}

/**
 * Generate a unique key for worktree-scoped auto loop state.
 */
export function getWorktreeAutoLoopKey(projectPath: string, branchName: string | null): string {
  const normalizedBranch = branchName === 'main' ? null : branchName;
  return `${projectPath}::${normalizedBranch ?? '__main__'}`;
}
