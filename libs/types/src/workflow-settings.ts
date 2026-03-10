/**
 * Workflow Settings - Pipeline hardening, trust boundary, and workflow behavior configuration
 *
 * Covers goal gates, checkpointing, loop detection, supervisor settings,
 * retro feedback, cleanup, signal intake, bug tracking, and PRD trust boundaries.
 */

import type { PipelineGateConfig } from './pipeline-phase.js';
import type { RiskLevel } from './policy.js';

// ============================================================================
// Trust Boundary Settings - PRD Approval Gate Configuration
// ============================================================================

/**
 * PRD Category - Type/purpose of a PRD
 */
export type PRDCategory = 'ops' | 'improvement' | 'bug' | 'feature' | 'idea' | 'architectural';

/**
 * PRD Complexity - Estimated scope and risk of a PRD
 */
export type PRDComplexity = 'small' | 'medium' | 'large' | 'architectural';

/**
 * AutoApproveRule - Criteria for automatically approving a PRD without review
 *
 * Conservative defaults: only small ops/bug PRDs auto-approve.
 * All conditions must match (AND logic) for auto-approval.
 */
export interface AutoApproveRule {
  /** Maximum complexity level that can be auto-approved (default: 'small') */
  maxComplexity?: PRDComplexity;
  /** Categories that are eligible for auto-approval (default: ['ops', 'improvement', 'bug']) */
  categories?: PRDCategory[];
  /** Maximum estimated cost in dollars (default: undefined = no limit) */
  maxEstimatedCost?: number;
}

/**
 * RequireReviewRule - Criteria for requiring human review before proceeding
 *
 * Any condition that matches (OR logic) triggers review requirement.
 */
export interface RequireReviewRule {
  /** Categories that always require review (default: ['idea', 'architectural']) */
  categories?: PRDCategory[];
  /** Minimum complexity level that requires review (default: 'large') */
  minComplexity?: PRDComplexity;
  /** Minimum estimated cost that requires review in dollars (default: undefined = no limit) */
  minEstimatedCost?: number;
}

/**
 * TrustBoundaryConfig - Trust boundary configuration for PRD approval gates
 *
 * Determines whether a PRD can be auto-approved or requires human review.
 * Conservative defaults: when in doubt, require review.
 */
export interface TrustBoundaryConfig {
  /** Whether trust boundary evaluation is enabled (default: true) */
  enabled: boolean;
  /** Auto-approval rules (all conditions must match) */
  autoApprove: AutoApproveRule;
  /** Review requirement rules (any condition triggers review) */
  requireReview: RequireReviewRule;
  /** Risk auto-approve threshold (work items with risk <= this level skip approval) */
  riskAutoApproveThreshold?: RiskLevel;
}

/**
 * Default trust boundary configuration - conservative defaults
 *
 * Only auto-approves:
 * - Small complexity
 * - ops/improvement/bug categories
 * - No cost limit
 * - Low risk level
 *
 * Always requires review:
 * - idea/architectural categories
 * - large or architectural complexity
 */
export const DEFAULT_TRUST_BOUNDARY_CONFIG: TrustBoundaryConfig = {
  enabled: true,
  autoApprove: {
    maxComplexity: 'small',
    categories: ['ops', 'improvement', 'bug'],
    maxEstimatedCost: undefined,
  },
  requireReview: {
    categories: ['idea', 'architectural'],
    minComplexity: 'large',
    minEstimatedCost: undefined,
  },
  riskAutoApproveThreshold: 'low',
};

// ============================================================================
// Workflow Settings - Pipeline hardening configuration
// ============================================================================

/**
 * WorkflowSettings — Configuration for pipeline hardening features.
 * Controls goal gates, checkpointing, loop detection, supervisor,
 * retro feedback, cleanup, and signal intake behavior.
 */
export interface WorkflowSettings {
  /** Per-branch gate configuration for the unified pipeline phases */
  gates?: PipelineGateConfig;
  pipeline: {
    /** Enable goal gate validation on state transitions (default: true) */
    goalGatesEnabled: boolean;
    /** Enable checkpoint persistence for crash recovery (default: true) */
    checkpointEnabled: boolean;
    /** Enable stream observer loop detection (default: true) */
    loopDetectionEnabled: boolean;
    /** Enable supervisor interval for stuck agent detection (default: true) */
    supervisorEnabled: boolean;
    /** Max agent runtime in minutes before supervisor warning (default: 45) */
    maxAgentRuntimeMinutes: number;
    /** Max agent cost in USD before supervisor abort (default: 15) */
    maxAgentCostUsd: number;
    /** Enable antagonistic plan review for large/architectural features (default: true) */
    antagonisticPlanReview?: boolean;
    /**
     * Maximum number of full agent re-runs triggered by agent-level failures
     * (e.g. bad code, logic errors). Each retry burns compute budget.
     * (default: 3)
     */
    maxAgentRetries?: number;
    /**
     * Maximum number of retries for lightweight infrastructure steps
     * (e.g. git push blocked by a lock file, gh CLI transient error).
     * These retries do NOT re-run the agent, so they are cheap.
     * (default: 3)
     */
    maxInfraRetries?: number;
  };
  retro: {
    /** Enable automatic retrospective generation on project completion (default: true) */
    enabled: boolean;
  };
  cleanup: {
    /** Enable automatic cleanup of stale worktrees/features (default: true) */
    autoCleanupEnabled: boolean;
    /** Hours before orphaned in-progress features are reset (default: 4) */
    staleThresholdHours: number;
  };
  signalIntake: {
    /** Default category for unclassified signals (default: 'ops') */
    defaultCategory: 'ops' | 'gtm';
    /** Whether to auto-trigger research on new signals (default: false) */
    autoResearch: boolean;
    /** Whether to auto-approve PRDs without user review (default: false) */
    autoApprovePRD: boolean;
  };
  bugs: {
    /** Enable bug tracking pipeline (creates GitHub issues from failures, default: false) */
    enabled: boolean;
    /** Also create GitHub issues (existing behavior, default: true) */
    createGithubIssues?: boolean;
  };
  /**
   * Run verification commands (typecheck, build) after merge to catch regressions.
   * On failure, creates a bug-fix feature on the board. Original feature is still marked done
   * since the code is already merged.
   * @default true
   */
  postMergeVerification?: boolean;
  /**
   * Commands to execute during post-merge verification.
   * `npm run build:packages` is added automatically when libs/ files were touched.
   * @default ['npm run typecheck']
   */
  postMergeVerificationCommands?: string[];
  /**
   * Run pre-flight checks before launching the agent in EXECUTE state.
   * Checks include: worktree currency (git fetch + rebase if behind), package build
   * (if libs/ files changed since worktree creation), and dependency merge verification
   * (foundation deps must be done, not just in review).
   * Pre-flight failures are classified as infrastructure failures and do NOT count
   * against the feature's agent retry budget.
   * @default true
   */
  preFlightChecks?: boolean;
  /**
   * Maximum number of PRs allowed in the review state before auto-mode pauses
   * new feature pickup. Prevents flooding the review queue.
   * When review count >= this threshold, the reviewQueueSaturated rule fires and
   * the scheduler pauses pickup until the queue drains below the threshold.
   * @default 5
   */
  maxPendingReviews?: number;
  /**
   * Rolling window (in days) over which the change fail rate is computed
   * for the error budget system. PRs merged outside this window are excluded.
   * @default 7
   */
  errorBudgetWindow?: number;
  /**
   * Change fail rate threshold (0-1) above which the error budget is considered
   * exhausted. When exhausted, auto-mode only picks up features tagged as bug-fix.
   * Example: 0.2 = 20% of merged PRs failed CI post-merge.
   * @default 0.2
   */
  errorBudgetThreshold?: number;
  /**
   * Enable execution gate checks before launching the agent in EXECUTE state.
   * When enabled, checks: (1) review queue depth < maxPendingReviews,
   * (2) error budget not exhausted, (3) CI not saturated (pending check runs < threshold).
   * If any check fails, the feature is returned to backlog with a statusChangeReason.
   * @default true
   */
  executionGate?: boolean;
  /**
   * Maximum number of pending GitHub check runs across open PRs before CI is
   * considered saturated. When saturated, execution gate blocks new agent starts.
   * @default 10
   */
  maxPendingCiRuns?: number;
  /**
   * Enable real authority enforcement in executeAction().
   * When true, actions above the agent's trust tier risk threshold are blocked,
   * an approval request is created in the actionable items queue, and the denial
   * is logged with full context (agent, action, risk level, trust tier).
   * When false (default), executeAction() is a no-op placeholder — existing behavior unchanged.
   * @default false
   */
  authorityEnforcement?: boolean;
  /**
   * Maximum cost in USD allowed per feature execution. If the feature's costUsd
   * reaches or exceeds this value after agent execution, the agent is killed and the
   * feature is moved to blocked with a statusChangeReason explaining the cap was hit.
   * A `cost:exceeded` event is emitted.
   * @default undefined (off — no cost cap enforced)
   */
  maxCostUsdPerFeature?: number;
  /**
   * Maximum wall-clock runtime in minutes allowed per feature execution. Measured from
   * the feature's startedAt timestamp. If elapsed minutes >= this value after agent
   * execution, the feature is moved to blocked with a statusChangeReason explaining the
   * cap was hit. A `runtime:exceeded` event is emitted.
   * @default 60
   */
  maxRuntimeMinutesPerFeature?: number;
}

/** Default workflow settings */
export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  pipeline: {
    goalGatesEnabled: true,
    checkpointEnabled: true,
    loopDetectionEnabled: true,
    supervisorEnabled: true,
    maxAgentRuntimeMinutes: 45,
    maxAgentCostUsd: 15,
    antagonisticPlanReview: true,
    maxAgentRetries: 3,
    maxInfraRetries: 3,
  },
  retro: {
    enabled: true,
  },
  cleanup: {
    autoCleanupEnabled: true,
    staleThresholdHours: 4,
  },
  signalIntake: {
    defaultCategory: 'ops',
    autoResearch: false,
    autoApprovePRD: false,
  },
  bugs: {
    enabled: false,
    createGithubIssues: true,
  },
  postMergeVerification: true,
  postMergeVerificationCommands: ['npm run typecheck'],
  preFlightChecks: true,
};
