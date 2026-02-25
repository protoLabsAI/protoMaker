/**
 * Auto-mode shared types
 *
 * Shared type definitions for the auto-mode service decomposition.
 * These types are used by ConcurrencyManager and related services.
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
