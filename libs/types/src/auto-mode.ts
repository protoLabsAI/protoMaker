/**
 * Auto-mode shared types
 *
 * Shared type definitions for the auto-mode service decomposition.
 * These types are used by ConcurrencyManager, FeatureStateManager, and related services.
 */

/**
 * A lease that tracks a running feature execution.
 * Used by ConcurrencyManager to support lease-based ref counting,
 * allowing nested feature execution (resume → execute) to increment
 * the lease count rather than throwing false-positive "already running" errors.
 */
export interface RunningFeatureLease {
  /** The feature being executed */
  featureId: string;
  /** The project this feature belongs to */
  projectPath: string;
  /** The worktree path if running in an isolated worktree, null for main worktree */
  worktreePath: string | null;
  /** The branch name associated with this feature, null if not yet assigned */
  branchName: string | null;
  /**
   * Ref count for nested acquire calls.
   * - 1 = first (outermost) execution
   * - >1 = nested call (e.g., resume → execute); should not throw "already running"
   */
  leaseCount: number;
  /** Unix timestamp (ms) when the lease was first acquired */
  startTime: number;
}

/**
 * Public snapshot of the state of a running (or paused) auto-loop.
 *
 * Auto-loops are uniquely identified by the composite key
 * `'projectPath::branchName'` (or `'projectPath::__main__'` for the
 * main worktree), enabling independent loops per branch within the
 * same project.
 */
export interface AutoLoopState {
  /** Composite key: `'projectPath::branchName'` or `'projectPath::__main__'` */
  key: string;

  /** Absolute path to the project being worked on */
  projectPath: string;

  /** Branch name, or `null` for the main worktree */
  branchName: string | null;

  /** Whether the loop is currently executing */
  isRunning: boolean;

  /**
   * Whether the loop has been paused by the rolling-failure circuit-breaker
   * or by an explicit call to `pauseLoop`.
   */
  isPaused: boolean;

  /** Maximum number of features that may run concurrently in this loop */
  maxConcurrency: number;

  /**
   * Number of failures recorded inside the current 60-second rolling window.
   * When this reaches the threshold (3) the loop is automatically paused.
   */
  failureCount: number;
}

/**
 * Execution state for recovery after server restart.
 * Written to .automaker/execution-state.json when auto-mode starts a feature.
 * Read by ReconciliationService on startup to restore in-flight features.
 */
export interface ExecutionState {
  /** Schema version, always 1 */
  version: 1;
  /** Whether the auto loop was running when this state was saved */
  autoLoopWasRunning: boolean;
  /** Maximum concurrent features setting */
  maxConcurrency: number;
  /** Project path this state belongs to */
  projectPath: string;
  /** Branch name for worktree-based execution (null = main worktree) */
  branchName: string | null;
  /** Feature IDs that were actively running when state was saved */
  runningFeatureIds: string[];
  /** ISO 8601 timestamp when state was saved */
  savedAt: string;
}
