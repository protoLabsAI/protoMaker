/**
 * Feature types for AutoMaker feature management
 */

import type { PlanningMode, ThinkingLevel, GitWorkflowSettings } from './settings.js';
import type { ReasoningEffort } from './provider.js';
import type { AgentRole } from './agent-roles.js';
import type { WorkItemState } from './authority.js';
import type { ReviewThreadFeedback, PendingFeedback } from './coderabbit.js';
import type { PipelineState } from './pipeline-phase.js';
import type { SignalChannel, SignalMetadata } from './signal-channel.js';

/**
 * A single entry in the description history
 */
export interface DescriptionHistoryEntry {
  description: string;
  timestamp: string; // ISO date string
  source: 'initial' | 'enhance' | 'edit'; // What triggered this version
  enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer'; // Only for 'enhance' source
}

export interface FeatureImagePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface FeatureTextFilePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  content: string; // Text content of the file
  [key: string]: unknown;
}

/**
 * Records a status transition in a feature's lifecycle.
 * Pushed to statusHistory array whenever the feature status changes.
 */
export interface StatusTransition {
  /** Previous status (null if this is the initial status) */
  from: FeatureStatus | null;
  /** New status */
  to: FeatureStatus;
  /** ISO 8601 timestamp when the transition occurred */
  timestamp: string;
  /** Optional reason for the status change (e.g., error message, PR merged) */
  reason?: string;
}

/**
 * Records a single agent execution on a feature.
 * Pushed to executionHistory array for each agent run (success or failure).
 */
export interface ExecutionRecord {
  /** Unique identifier for this execution */
  id: string;
  /** ISO 8601 timestamp when the agent started */
  startedAt: string;
  /** ISO 8601 timestamp when the agent finished (success or failure) */
  completedAt?: string;
  /** Duration of the execution in milliseconds */
  durationMs?: number;
  /** Total cost in USD for this execution */
  costUsd?: number;
  /** Number of input tokens consumed */
  inputTokens?: number;
  /** Number of output tokens produced */
  outputTokens?: number;
  /** Model used for this execution */
  model: string;
  /** Whether the execution completed successfully */
  success: boolean;
  /** Error message if the execution failed */
  error?: string;
  /** Number of turns the agent took */
  turnCount?: number;
  /** What triggered this execution (auto-mode, manual, retry) */
  trigger: 'auto' | 'manual' | 'retry';
}

/**
 * Records a remediation attempt in response to PR review feedback.
 * Tracks each iteration with timing and metadata.
 */
export interface RemediationHistoryEntry {
  /** Unique identifier for this remediation attempt */
  id: string;
  /** Which iteration this represents (1-indexed) */
  iteration: number;
  /** Type of remediation cycle: feedback from reviewers or CI check failures */
  cycleType: 'feedback' | 'ci_failure';
  /** ISO 8601 timestamp when remediation started */
  startedAt: string;
  /** ISO 8601 timestamp when remediation completed */
  completedAt?: string;
  /** Number of review threads processed in this cycle */
  threadCount?: number;
  /** Number of threads accepted by agent */
  acceptedCount?: number;
  /** Number of threads denied by agent */
  deniedCount?: number;
  /** Audit trail of denied threads with severity and reasoning */
  denialAuditTrail?: Array<{
    threadId: string;
    severity: 'critical' | 'warning' | 'suggestion' | 'info';
    reasoning: string;
    deniedAt: string;
  }>;
  /** CI checks that were fixed in this cycle */
  ciChecksFixed?: string[];
  /** Model used for this remediation attempt */
  agentModel?: string;
  /** Total cost in USD for this remediation cycle */
  costUsd?: number;
  /** Whether the remediation completed successfully */
  success?: boolean;
  /** Error message if remediation failed */
  error?: string;
  /** Summary of changes made during this remediation */
  changesSummary?: string;
}

export interface Feature {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  passes?: boolean;
  /**
   * Priority level for this feature.
   * 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.
   * Auto-mode picks up higher priority (lower number) features first.
   * Features without priority default to 3 (Normal) for sorting.
   */
  priority?: 0 | 1 | 2 | 3 | 4;
  status?: FeatureStatus | string; // Allow string for extensibility
  dependencies?: string[];
  /**
   * Reason why this feature is blocked by dependencies.
   * Populated by dependency resolver when getBlockingInfo detects unsatisfied dependencies.
   */
  blockingReason?: string;
  /**
   * True if this feature is blocked by a dependency assigned to a human.
   * Set by dependency resolver when human-assigned blockers are detected.
   */
  blockedByHuman?: boolean;
  spec?: string;
  model?: string;
  imagePaths?: Array<string | FeatureImagePath | { path: string; [key: string]: unknown }>;
  textFilePaths?: FeatureTextFilePath[];
  // Branch info - worktree path is derived at runtime from branchName
  branchName?: string; // Name of the feature branch (undefined = use current worktree)
  // Epic support - hierarchical grouping
  isEpic?: boolean; // True if this feature is an epic (container for child features)
  epicId?: string; // ID of parent epic (if this feature belongs to an epic)
  epicColor?: string; // Color for epic badge display (hex color)
  // Project/milestone tracking for milestone-gated execution
  projectSlug?: string; // Project this feature belongs to
  milestoneSlug?: string; // Milestone this feature belongs to
  skipTests?: boolean;
  thinkingLevel?: ThinkingLevel;
  reasoningEffort?: ReasoningEffort;
  planningMode?: PlanningMode;
  requirePlanApproval?: boolean;
  planSpec?: {
    status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
    content?: string;
    version: number;
    generatedAt?: string;
    approvedAt?: string;
    reviewedByUser: boolean;
    tasksCompleted?: number;
    tasksTotal?: number;
  };
  error?: string;
  summary?: string;
  startedAt?: string;
  descriptionHistory?: DescriptionHistoryEntry[]; // History of description changes
  /** Override global git workflow settings for this specific feature */
  /** Per-feature git workflow settings (overrides global settings) */
  gitWorkflow?: Partial<GitWorkflowSettings>;
  /**
   * Feature complexity level - affects model selection
   * - small: Quick fixes, trivial changes (haiku)
   * - medium: Standard features (sonnet) - default
   * - large: Complex multi-file features (sonnet)
   * - architectural: Core infrastructure, key architecture decisions (opus)
   */
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  /**
   * Marks this feature as foundational infrastructure (e.g., package scaffold,
   * directory structure, base types). Features that depend on a foundation feature
   * will NOT start until the foundation reaches 'done' (PR merged to main).
   * Without this flag, dependencies are satisfied at 'review' status.
   */
  isFoundation?: boolean;
  /**
   * Number of times this feature has failed and been retried.
   * Used for model escalation - after multiple failures, escalate to opus.
   */
  failureCount?: number;
  /**
   * Number of auto-retry attempts for this feature.
   * Incremented each time ReconciliationService auto-resets a blocked feature.
   * Max 3 retries per feature.
   */
  retryCount?: number;
  /**
   * Timestamp of the last failure (ISO 8601).
   * Used to implement cooldown period before auto-retry.
   */
  lastFailureTime?: string;
  /**
   * Total cost in USD for all agent executions on this feature.
   * Populated from SDK's total_cost_usd in the result message.
   */
  costUsd?: number;
  /**
   * History of all agent executions on this feature.
   * Each record captures timing, cost, tokens, model, and outcome.
   */
  executionHistory?: ExecutionRecord[];
  /**
   * Override max turns for this feature's agent execution.
   * If not set, turns are derived from complexity:
   * - small: 200, medium: 500, large: 750, architectural: 1000
   */
  maxTurns?: number;
  /**
   * Last SDK session ID from agent execution.
   * Stored on failure so subsequent retries can resume from where the agent left off.
   */
  lastSessionId?: string;
  /**
   * Assigned agent role (for headsdown agents)
   * Determines which specialized agent should work on this feature.
   */
  assignedRole?: AgentRole;
  /**
   * Agent instance ID that claimed this feature
   * Used to track which headsdown agent is working on this.
   */
  assignedAgentId?: string;
  /**
   * AI-generated routing suggestion from the feature classifier.
   * Shows recommended agent role, confidence score, and reasoning.
   */
  routingSuggestion?: {
    role: AgentRole;
    confidence: number;
    reasoning: string;
    autoAssigned: boolean;
    suggestedAt: string;
  };
  /**
   * Who this feature is assigned to.
   * - If set to a human name (e.g., 'josh'), auto-mode will skip this feature
   * - If set to 'agent' or undefined/null, auto-mode can pick it up
   * - Used to reserve features for human implementation while allowing agents to work on others
   */
  assignee?: string | null;
  /**
   * Due date for this feature (ISO 8601 date string, YYYY-MM-DD).
   * Used to track deadlines and help with scheduling and prioritization.
   */
  dueDate?: string;
  /**
   * Linear issue ID (if synced to Linear)
   * Links feature to external project management system.
   */
  linearIssueId?: string;
  /**
   * Linear issue URL (if synced to Linear)
   * Direct link to the Linear issue for this feature.
   */
  linearIssueUrl?: string;
  /**
   * Work item state for the authority system.
   * Extended lifecycle: idea → research → planned → ready → in_progress → blocked → testing → done
   * Only used when authority system is enabled.
   */
  workItemState?: WorkItemState;
  /**
   * Unified pipeline state for idea-to-production tracking.
   * When present, this feature is being tracked through the 9-phase pipeline
   * (TRIAGE → RESEARCH → SPEC → SPEC_REVIEW → DESIGN → PLAN → EXECUTE → VERIFY → PUBLISH).
   * Features without pipelineState work via the existing event-driven agents.
   */
  pipelineState?: PipelineState;
  /**
   * PRD metadata for ideation-to-PM flow.
   * Populated when a suggestion is submitted to PM Agent for PRD generation.
   */
  prdMetadata?: {
    generatedAt: string;
    model: string;
    originalSuggestion?: {
      id: string;
      title: string;
      description: string;
      category: string;
      rationale?: string;
      relatedFiles?: string[];
    };
  };
  /**
   * PR tracking for the EM feedback loop.
   * Populated by auto-mode after git workflow creates a PR.
   */
  prUrl?: string;
  prNumber?: number;
  /**
   * Number of PR review iterations (feedback → fix cycles).
   * Incremented each time the EM reassigns the feature for PR fixes.
   */
  prIterationCount?: number;
  /**
   * Summary of the most recent PR review feedback.
   */
  lastReviewFeedback?: string;
  /**
   * Timestamp when PR tracking started (ISO 8601).
   * Set by PRFeedbackService when a PR is first tracked.
   */
  prTrackedSince?: string;
  /**
   * Timestamp of the last PR polling check (ISO 8601).
   * Updated by PRFeedbackService after each GitHub API poll.
   */
  prLastPolledAt?: string;
  /**
   * GitHub issue number (if an issue was auto-created for this feature).
   * Set by IssueCreationService when a feature exceeds max retries or is escalated.
   */
  githubIssueNumber?: number;
  /**
   * GitHub issue URL (if an issue was auto-created for this feature).
   */
  githubIssueUrl?: string;
  /**
   * Beads task ID (if linked to a Beads issue)
   * Links feature to Ava's operational task manager.
   */
  beadsTaskId?: string;
  /**
   * Per-thread review feedback tracking with agent decisions.
   * Each thread can be accepted, denied, or pending with reasoning.
   */
  threadFeedback?: ReviewThreadFeedback[];
  /**
   * History of remediation attempts for PR review feedback.
   * Tracks iterations with timestamps and metadata.
   */
  remediationHistory?: RemediationHistoryEntry[];
  /**
   * Total remediation cycle count (feedback + CI failures combined).
   * Incremented for each feedback cycle OR CI cycle.
   * Used to enforce MAX_TOTAL_REMEDIATION_CYCLES budget.
   */
  remediationCycleCount?: number;
  /**
   * Number of CI failure remediation cycles.
   * Tracks how many times the agent has fixed CI failures.
   */
  ciIterationCount?: number;
  /**
   * Last check suite ID processed for this feature.
   * Used to deduplicate CI failure events.
   */
  lastCheckSuiteId?: number;
  /**
   * Pending feedback that arrived while remediation was in progress.
   * Queued for processing when current remediation completes.
   */
  pendingFeedback?: PendingFeedback;
  /**
   * Linear sync metadata for bidirectional sync with Linear.
   * Tracks sync state, timestamps, and conflict detection.
   */
  linearSyncMetadata?: import('./linear.js').LinearSyncMetadata;
  /**
   * Timestamp when the PR was created (ISO 8601).
   * Set by git-workflow-service when auto-creating a PR.
   */
  prCreatedAt?: string;
  /**
   * Timestamp when the PR was merged (ISO 8601).
   * Set by git-workflow-service after successful merge.
   */
  prMergedAt?: string;
  /**
   * Duration of PR review in milliseconds.
   * Computed as: prMergedAt - prCreatedAt
   */
  prReviewDurationMs?: number;
  /**
   * Lifecycle timestamps for tracking feature progression through statuses.
   * All timestamps are ISO 8601 strings.
   */
  createdAt?: string; // When the feature was first created
  updatedAt?: string | number; // Last modification timestamp (ISO 8601 or epoch ms)
  completedAt?: string; // When the feature was marked as done
  /** Timestamp when agent just finished (for "just completed" badge, ISO 8601) */
  justFinishedAt?: string;
  /** Reason for the most recent status change (used in status transition history) */
  statusChangeReason?: string;
  reviewStartedAt?: string; // When the feature entered review status
  /**
   * History of all status transitions for this feature.
   * Each transition records the from/to status, timestamp, and optional reason.
   */
  statusHistory?: StatusTransition[];

  /**
   * Last Langfuse trace ID from the most recent agent execution.
   * Used to correlate agent runs with observability data for scoring and analysis.
   */
  lastTraceId?: string;

  /**
   * Git workflow error details when git operations (commit, push, PR) fail.
   * The feature status remains unchanged (e.g., verified), but this field
   * surfaces the failure in the UI for visibility and debugging.
   */
  gitWorkflowError?: {
    message: string;
    timestamp: string; // ISO 8601 timestamp when the error occurred
  };

  // Hivemind fields
  /** Domain this feature belongs to (e.g. "frontend", "server") for mesh routing */
  domain?: string;
  /** Instance ID that has claimed this feature for execution */
  claimedBy?: string;

  // Signal provenance — tracks which channel originated this feature
  /**
   * The channel that originated this feature (e.g. 'linear', 'discord', 'github', 'ui').
   * Used by ChannelRouter to route approvals, forms, and notifications back to the right channel.
   */
  sourceChannel?: SignalChannel;
  /**
   * Full metadata about the originating signal, including IDs for routing replies.
   */
  signalMetadata?: SignalMetadata;

  // Quarantine fields
  /** Source of this feature submission */
  source?: 'internal' | 'ui' | 'api' | 'mcp' | 'github_issue' | 'github_discussion';
  /** Trust tier of the submitter (0=anonymous, 1=github_user, 2=contributor, 3=maintainer, 4=system) */
  trustTier?: import('./quarantine.js').TrustTier;
  /** Current quarantine processing status */
  quarantineStatus?: 'pending' | 'passed' | 'failed' | 'bypassed';
  /** Links to QuarantineEntry record */
  quarantineId?: string;
  /** Reason for quarantine failure (if quarantineStatus === 'failed') */
  quarantineFailureReason?: string;

  // Promotion tracking fields
  /**
   * ID of the PromotionCandidate record for this feature.
   * Set when this feature is detected as a promotion candidate after merging to dev.
   */
  stagingCandidateId?: string;
  /**
   * ID of the PromotionBatch this feature has been included in.
   * Set when this feature is added to a promotion batch targeting staging/main.
   */
  promotionBatchId?: string;

  // GTM Content Track fields
  /**
   * Type of feature: 'code' for engineering work, 'content' for GTM/marketing content.
   * Defaults to 'code' for all existing features.
   */
  featureType?: 'code' | 'content';
  /**
   * Content configuration for GTM content features (only relevant when featureType === 'content').
   */
  contentConfig?: {
    /** Topic or subject of the content piece */
    topic?: string;
    /** Format of the content */
    format?: 'blog' | 'docs' | 'social' | 'announcement';
    /** Target audience for the content */
    targetAudience?: string;
    /** Team member assigned to create this content */
    assignedRole?: 'jon' | 'cindi';
  };
}

/**
 * Canonical feature status values (5 statuses)
 * Strategic decision: Single source of truth for all feature states
 *
 * Flow: backlog → in_progress → review → done
 *                      ↓           ↓
 *                   blocked ← ← ← ┘
 *
 * @deprecated Legacy values (auto-migrated):
 * - pending, ready → backlog
 * - running → in_progress
 * - completed, waiting_approval → done
 * - failed → blocked
 * - verified → done
 */
export type FeatureStatus =
  | 'backlog' // Queued, ready to start (consolidates: pending, ready)
  | 'in_progress' // Being worked on (consolidates: running)
  | 'review' // PR created, under review
  | 'blocked' // Temporary halt (dependency/issue/failure - consolidates: failed)
  | 'done' // PR merged, work complete (consolidates: completed, waiting_approval, verified)
  | 'interrupted'; // Server shut down while feature was running

/**
 * Legacy status values for backwards compatibility
 * @deprecated Use canonical FeatureStatus values instead
 */
export type LegacyFeatureStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'waiting_approval'
  | 'failed';

/**
 * Normalizes legacy feature status values to canonical 6-status system
 *
 * Migration map:
 * - pending, ready → backlog
 * - running → in_progress
 * - completed, waiting_approval → done
 * - failed → blocked
 *
 * @param status - Raw status value (may be legacy or canonical)
 * @param telemetry - Optional callback for tracking migrations
 * @returns Canonical FeatureStatus value
 */
export function normalizeFeatureStatus(
  status: string | undefined,
  telemetry?: (from: string, to: FeatureStatus) => void
): FeatureStatus {
  // Default to backlog if undefined
  if (!status) {
    return 'backlog';
  }

  // Already canonical - fast path
  const canonical: FeatureStatus[] = [
    'backlog',
    'in_progress',
    'review',
    'blocked',
    'done',
    'interrupted',
  ];
  if (canonical.includes(status as FeatureStatus)) {
    return status as FeatureStatus;
  }

  // Normalize legacy values
  let normalized: FeatureStatus;
  switch (status) {
    case 'pending':
    case 'ready':
      normalized = 'backlog';
      break;
    case 'running':
      normalized = 'in_progress';
      break;
    case 'completed':
    case 'waiting_approval':
    case 'verified': // Legacy terminal state — fold into done
      normalized = 'done';
      break;
    case 'failed':
      normalized = 'blocked';
      break;
    default:
      // Unknown status - log warning and default to backlog
      console.warn(`Unknown feature status "${status}", defaulting to backlog`);
      normalized = 'backlog';
      break;
  }

  // Track migration for telemetry
  if (telemetry && status !== normalized) {
    telemetry(status, normalized);
  }

  return normalized;
}
