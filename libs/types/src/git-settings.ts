/**
 * Git Settings - Configuration for git workflow automation
 *
 * Covers automatic commit, push, PR creation, and merge after feature completion,
 * plus Graphite CLI integration for stack-aware PR management.
 */

// ============================================================================
// Git Workflow Settings - Auto commit/push/PR after feature completion
// ============================================================================

/**
 * PR merge strategy for auto-merge
 * - merge: Create a merge commit (preserves all commits)
 * - squash: Squash all commits into a single commit
 * - rebase: Rebase and merge (creates a linear history)
 */
export type PRMergeStrategy = 'merge' | 'squash' | 'rebase';

/**
 * GitWorkflowSettings - Configuration for automatic git operations after feature completion
 *
 * When an agent successfully completes a feature, these settings control whether
 * to automatically commit changes, push to remote, create a pull request, and merge it.
 */
export interface GitWorkflowSettings {
  /** Auto-commit changes when feature reaches verified status (default: true) */
  autoCommit?: boolean;
  /** Auto-push to remote after commit - requires autoCommit (default: true) */
  autoPush?: boolean;
  /** Auto-create PR after push - requires autoPush (default: true) */
  autoCreatePR?: boolean;
  /** Auto-merge PR after creation - requires autoCreatePR (default: false) */
  autoMergePR?: boolean;
  /** PR merge strategy: merge, squash, or rebase (default: 'squash') */
  prMergeStrategy?: PRMergeStrategy;
  /** Wait for CI checks to pass before merging (default: true) */
  waitForCI?: boolean;
  /** Base branch for PR creation (default: 'main') */
  prBaseBranch?: string;
}

/**
 * Default git workflow settings - commit/push/PR/auto-merge enabled by default
 */
export const DEFAULT_GIT_WORKFLOW_SETTINGS: Required<GitWorkflowSettings> = {
  autoCommit: true,
  autoPush: true,
  autoCreatePR: true,
  autoMergePR: true,
  prMergeStrategy: 'squash',
  waitForCI: true,
  prBaseBranch: 'main',
};

/**
 * GitWorkflowResult - Result of running the git workflow after feature completion
 */
export interface GitWorkflowResult {
  /** Commit hash if changes were committed (null if no changes or commit disabled) */
  commitHash: string | null;
  /** Whether the branch was pushed to remote */
  pushed: boolean;
  /** URL of created PR (null if PR creation disabled or failed) */
  prUrl: string | null;
  /** PR number if created */
  prNumber?: number;
  /** Whether a PR already existed for this branch */
  prAlreadyExisted?: boolean;
  /** Whether the PR was merged (null if auto-merge disabled or failed) */
  merged?: boolean;
  /** Commit SHA of the merge commit (if merged) */
  mergeCommitSha?: string;
  /** Timestamp when the PR was created (ISO 8601) */
  prCreatedAt?: string;
  /** Timestamp when the PR was merged (ISO 8601) */
  prMergedAt?: string;
  /** Error message if any step failed (workflow continues best-effort) */
  error?: string;
}

// ============================================================================
// Graphite CLI Integration - Stack-aware PR management
// ============================================================================

/**
 * GraphiteSettings - Configuration for Graphite CLI integration
 *
 * Graphite provides stack-aware PR management, making it easier to work with
 * feature branches that stack on epic branches. When enabled, Automaker uses
 * Graphite CLI commands instead of raw git/gh commands for better stack handling.
 *
 * @see https://graphite.dev/docs/graphite-cli
 */
export interface GraphiteSettings {
  /** Enable Graphite CLI integration (default: false) */
  enabled: boolean;
  /** Use gt commit instead of git commit (default: false) */
  useGraphiteCommit?: boolean;
  /** Auto-track epic branches as stack parents (default: true) */
  autoTrackEpics?: boolean;
  /** Use gt stack submit for bulk PR creation (default: false) */
  useStackSubmit?: boolean;
}

/**
 * Default Graphite settings - disabled by default for backward compatibility
 */
export const DEFAULT_GRAPHITE_SETTINGS: GraphiteSettings = {
  enabled: false,
  useGraphiteCommit: false,
  autoTrackEpics: true,
  useStackSubmit: false,
};
