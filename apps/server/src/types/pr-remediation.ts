/**
 * Types for PR format-failure auto-remediation.
 *
 * These types are server-internal. They are not part of the shared
 * @protolabsai/types package because they relate to server-specific
 * remediation operations.
 */

// ---------------------------------------------------------------------------
// Format remediation
// ---------------------------------------------------------------------------

/** What happened during a format remediation attempt */
export type FormatRemediationStatus =
  /** Prettier ran, files formatted, commit pushed */
  | 'success'
  /** Guard condition prevented remediation (protected branch, non-agent PR, cap reached) */
  | 'skipped'
  /** Prettier ran but scope drift detected, or execution error — HITL needed */
  | 'escalated'
  /** Unexpected error during remediation */
  | 'error';

/** Input to the format remediation process */
export interface FormatRemediationInput {
  /** Path to the project root (where .automaker/ lives, used for worktree lookup) */
  projectPath: string;
  /** GitHub PR number */
  prNumber: number;
  /** PR head branch name (e.g. feature/feat-auth) */
  headBranch: string;
  /** PR head commit SHA */
  headSha: string;
  /** GitHub repository full name (owner/repo) */
  repository: string;
  /** URL to check runs list (from check_suite.check_runs_url) */
  checksUrl?: string;
}

/** Result from a format remediation attempt */
export interface FormatRemediationResult {
  status: FormatRemediationStatus;
  prNumber: number;
  /** Files that were reformatted and committed */
  filesFixed?: string[];
  /** Git commit SHA of the remediation commit */
  commitSha?: string;
  /** Human-readable reason for the result */
  reason: string;
  /** Additional metadata for observability */
  details?: Record<string, unknown>;
}

/** Payload of the pr:remediation-completed event emitted after successful format remediation */
export interface PRFormatRemediatedPayload {
  prNumber: number;
  filesFixed: string[];
  commitSha: string;
  timestamp: string;
  /** Discriminator: identifies this as a format remediation (not a conflict remediation) */
  remediationType: 'format';
}

// ---------------------------------------------------------------------------
// CI check run shape (subset of GitHub check_runs API response)
// ---------------------------------------------------------------------------

export interface GitHubCheckRunSummary {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export interface GitHubCheckRunsListResponse {
  total_count: number;
  check_runs: GitHubCheckRunSummary[];
}
