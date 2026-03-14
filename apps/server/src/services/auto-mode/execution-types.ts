/**
 * Shared types for auto-mode execution service decomposition.
 * Used by both AutoModeService and ExecutionService.
 */

import type { Feature, ModelProvider } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Shared state types (previously defined inline in auto-mode-service.ts)
// ---------------------------------------------------------------------------

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
  /** Recovery tracking */
  retryCount: number;
  previousErrors: string[];
  recoveryContext?: string;
}

export interface PendingApproval {
  resolve: (result: { approved: boolean; editedPlan?: string; feedback?: string }) => void;
  reject: (error: Error) => void;
  featureId: string;
  projectPath: string;
}

/** Options passed to executeFeature for continuation / retry scenarios. */
export interface ExecuteFeatureOptions {
  continuationPrompt?: string;
  retryCount?: number;
  previousErrors?: string[];
  recoveryContext?: string;
  /**
   * When true, skip the duplicate-execution guard at the top of executeFeature.
   * Used for recursive calls (e.g. continuation after plan approval) so that
   * the featureId stays in runningFeatures throughout the handoff with no gap.
   */
  isRecursive?: boolean;
}

// ---------------------------------------------------------------------------
// Internal types only used within execution logic
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Callback interface – methods that stay in AutoModeService but are called
// by ExecutionService. Passed at construction time to avoid circular imports.
// ---------------------------------------------------------------------------

export interface IAutoModeCallbacks {
  // Feature loading / management
  loadFeature(projectPath: string, featureId: string): Promise<Feature | null>;
  contextExists(projectPath: string, featureId: string): Promise<boolean>;
  resumeFeature(projectPath: string, featureId: string, useWorktrees: boolean): Promise<void>;

  // Worktree management
  findExistingWorktreeForBranch(projectPath: string, branchName: string): Promise<string | null>;
  createWorktreeForBranch(
    projectPath: string,
    branchName: string,
    feature: Feature
  ): Promise<string | null>;

  // State persistence
  saveExecutionState(projectPath: string): Promise<void>;

  /** Returns the current value of autoLoopRunning. */
  getAutoLoopRunning(): boolean;

  // Status updates
  updateFeatureStatus(projectPath: string, featureId: string, status: string): Promise<void>;
  updateFeaturePlanSpec(
    projectPath: string,
    featureId: string,
    updates: Partial<PlanSpec>
  ): Promise<void>;

  // Success / failure tracking
  recordSuccessForProject(projectPath: string, branchName: string | null): void;
  trackFailureAndCheckPauseForProject(
    projectPath: string,
    branchName: string | null,
    error: { type: string; message: string }
  ): boolean;
  signalShouldPauseForProject(
    projectPath: string,
    branchName: string | null,
    error: { type: string; message: string }
  ): void;

  // Plan approval gate (used inside runAgent for spec/full planning modes)
  waitForPlanApproval(
    featureId: string,
    projectPath: string
  ): Promise<{ approved: boolean; editedPlan?: string; feedback?: string }>;
  cancelPlanApproval(featureId: string): void;
}
