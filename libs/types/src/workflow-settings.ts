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
};
