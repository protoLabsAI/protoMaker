import type { PipelinePhase } from './pipeline-phase.js';
import type { HITLFormCallerType, HITLFormRequestSummary } from './hitl-form.js';

/**
 * Event types for AutoMaker event system
 */

export type EventType =
  | 'agent:stream'
  | 'agent:timeout'
  | 'auto-mode:event'
  | 'auto-mode:started'
  | 'auto-mode:stopped'
  | 'auto-mode:idle'
  | 'auto-mode:error'
  | 'auto-mode:health-check'
  | 'backlog-plan:event'
  | 'feature:created'
  | 'feature:started'
  | 'feature:completed'
  | 'feature:stopped'
  | 'feature:error'
  | 'feature:progress'
  | 'feature:tool-use'
  | 'feature:follow-up-started'
  | 'feature:follow-up-completed'
  | 'feature:reflection:complete'
  | 'feature:committed'
  | 'feature:retry'
  | 'feature:recovery'
  | 'feature:pr-merged'
  | 'feature:blocked'
  | 'feature:unblocked'
  | 'project:analysis-started'
  | 'project:analysis-progress'
  | 'project:analysis-completed'
  | 'project:analysis-error'
  | 'project:features:start'
  | 'project:features:progress'
  | 'project:features:error'
  | 'project:features:done'
  | 'suggestions:event'
  | 'spec-regeneration:event'
  | 'issue-validation:event'
  // Ideation events (used by PM agent and Discord bot for idea-to-feature workflow)
  | 'ideation:submit-to-pm'
  | 'ideation:prd-generated'
  | 'ideation:prd-approved'
  | 'worktree:init-started'
  | 'worktree:init-output'
  | 'worktree:init-completed'
  | 'dev-server:started'
  | 'dev-server:output'
  | 'dev-server:stopped'
  | 'skill:created'
  | 'memory:learning'
  | 'notification:created'
  // Actionable item events (unified user attention system)
  | 'actionable-item:created'
  | 'actionable-item:status-changed'
  | 'actionable-item:snoozed'
  | 'health:check-completed'
  | 'health:issue-detected'
  | 'health:issue-remediated'
  | 'scheduler:started'
  | 'scheduler:stopped'
  | 'scheduler:task_registered'
  | 'scheduler:task_unregistered'
  | 'scheduler:task_enabled'
  | 'scheduler:task_disabled'
  | 'scheduler:task_started'
  | 'scheduler:task_completed'
  | 'maintenance'
  | 'recovery_analysis'
  | 'recovery_started'
  | 'recovery_completed'
  | 'recovery_recorded'
  | 'recovery_escalated'
  | 'recovery_lesson_generated'
  // Headsdown agent events (autonomous agents)
  | 'headsdown:agent:started'
  | 'headsdown:agent:stopped'
  | 'headsdown:agent:working'
  | 'headsdown:agent:idle'
  | 'headsdown:agent:error'
  | 'headsdown:agent:paused'
  | 'headsdown:agent:resumed'
  | 'headsdown:agent:work-completed'
  | 'headsdown:agent:work-failed'
  // CodeRabbit review events
  | 'coderabbit:review-received'
  | 'coderabbit:feedback-processed'
  | 'coderabbit:link-created'
  // Webhook events
  | 'webhook:github:issue'
  | 'webhook:github:pull_request'
  | 'webhook:github:push'
  | 'webhook:github:issue_comment'
  // PR review events
  | 'pr:review-submitted'
  // Integration events
  | 'integration:linear'
  | 'integration:discord'
  // Integration registry events (unified integration management)
  | 'integration:registered'
  | 'integration:unregistered'
  | 'integration:toggled'
  // Project orchestration events
  | 'project:scaffolded'
  | 'project:deleted'
  | 'project:status-changed'
  // PRD events (Product Requirements Documents)
  | 'prd:created'
  | 'prd:status:updated'
  | 'prd:review:started'
  | 'prd:review:completed'
  // Discord monitoring events
  | 'discord:message:detected'
  // Discord DM events
  | 'discord:dm:received'
  | 'discord:dm:sent'
  | 'discord:user-message:routed'
  // Linear monitoring events
  | 'linear:project:created'
  | 'linear:project:updated'
  | 'linear:project:status-updated'
  | 'linear:project:milestones-synced'
  | 'linear:issue:detected'
  // Linear sync events (bidirectional sync)
  | 'linear:sync:started'
  | 'linear:sync:completed'
  | 'linear:sync:error'
  | 'linear:sync:conflict'
  | 'linear:issue:updated'
  | 'linear:approval:detected'
  | 'linear:approval:bridged'
  | 'linear:changes-requested:detected'
  | 'linear:intake:triggered'
  | 'linear:intake:bridged'
  | 'feature:agent-suggested'
  | 'feature:agent-assigned'
  // Linear agent session events (webhook-driven)
  | 'linear:agent-session:created'
  | 'linear:agent-session:prompted'
  | 'linear:agent-session:updated'
  | 'linear:agent-session:removed'
  // Linear project planning events
  | 'linear:project:created'
  // Linear comment events (webhook-driven)
  | 'linear:comment:created'
  | 'linear:comment:instruction'
  | 'linear:comment:followup'
  // Linear project update events (webhook-driven)
  | 'linear:project-update:created'
  | 'linear:project-update:updated'
  | 'linear:project-update:approved'
  // Linear SLA events (Business plan feature - HITL deepening)
  | 'linear:sla:highRisk'
  | 'linear:sla:breached'
  // GitHub monitoring events
  | 'github:pr:detected'
  // Linear monitor events
  | 'linear-monitor:started'
  | 'linear-monitor:stopped'
  | 'linear-monitor:poll-requested'
  | 'linear-monitor:poll-error'
  | 'linear-monitor:project-detected'
  | 'linear-monitor:trigger-error'
  // Linear agent events (webhook-based agent integration)
  | 'linear:agent:thought'
  | 'linear:agent:routed'
  | 'linear:agent:error'
  // Feature assignment events
  | 'feature-assignment:started'
  | 'feature-assignment:completed'
  | 'feature-assignment:failed'
  | 'feature-assignment:cancelled'
  | 'feature-assignment:em-agent-spawn'
  | 'feature-assignment:error'
  // Authority system events
  | 'authority:proposal-submitted'
  | 'authority:approved'
  | 'authority:rejected'
  | 'authority:awaiting-approval'
  | 'authority:agent-registered'
  | 'authority:trust-updated'
  | 'authority:auto-approved'
  | 'authority:audit-logged'
  | 'authority:idea-injected'
  | 'authority:cto-approved-idea'
  | 'authority:pm-review-started'
  | 'authority:pm-review-approved'
  | 'authority:pm-review-changes-requested'
  | 'authority:pm-research-started'
  | 'authority:pm-research-completed'
  | 'authority:pm-prd-ready'
  | 'authority:pm-epic-created'
  | 'authority:registry-ready'
  // Milestone lifecycle events
  | 'milestone:planning-started'
  | 'milestone:planned'
  | 'milestone:started'
  | 'milestone:completed'
  | 'milestone:cto-approval-requested'
  | 'milestone:cto-approved'
  // Project completion events
  | 'project:completed'
  | 'project:reflection:complete'
  | 'project:prd:changes-requested'
  // CoS intake events
  | 'cos:prd-submitted'
  // PR feedback loop events (EM dev lifecycle)
  | 'pr:feedback-received'
  | 'pr:changes-requested'
  | 'pr:approved'
  | 'pr:ci-failure'
  | 'pr:agent-restart-failed'
  | 'feature:reassigned-for-fixes'
  | 'feature:worktree-cleaned'
  // PR remediation events (automated PR maintenance and thread resolution)
  | 'pr:feedback-queued' // Fired when feedback arrives while remediation is in progress
  | 'pr:remediation-started' // Fired when PR remediation workflow begins (agent spawned to address feedback)
  | 'pr:remediation-completed' // Fired when PR remediation workflow completes successfully
  | 'pr:remediation-failed' // Fired when PR remediation workflow fails
  | 'pr:thread-evaluated' // Fired when a single PR review thread is evaluated for resolution status
  | 'pr:threads-resolved' // Fired when all PR review threads are marked as resolved
  | 'pr:merge-blocked-critical-threads' // Fired when merge is blocked due to critical review threads
  // Worktree recovery events
  | 'worktree:drift-detected'
  | 'worktree:phantom-pruned'
  // World state monitor events
  | 'world-state:reconciliation'
  // Chief of Staff (CoS) events
  | 'cos:prd-submitted'
  // Decision tracking events (via AuditService)
  | 'decision:logged'
  | 'decision:superseded'
  | 'decision:reverted'
  // Beads task management events
  | 'beads:task-created'
  | 'beads:task-updated'
  | 'beads:task-closed'
  | 'beads:dependency-added'
  // Ceremony events (milestone updates and project retrospectives)
  | 'ceremony:milestone-update'
  | 'ceremony:project-retro'
  | 'ceremony:triggered'
  | 'ceremony:fired'
  | 'ceremony:post-project-docs'
  | 'ceremony:post-project-docs:complete'
  | 'ceremony:post-project-docs:failed'
  // Retro improvement events (reflection loop: REFLECT → REPEAT)
  | 'retro:improvements:created'
  | 'retro:improvement:linear-sync'
  // Bug tracking pipeline events (failure → triage → Linear)
  | 'bug:linear-sync'
  // Docs update detector events
  | 'docs:update-needed'
  // Settings change events
  | 'settings:workflow-changed'
  // Feature lifecycle events
  | 'feature:status-changed'
  | 'feature:deleted'
  | 'feature:updated'
  // Issue management events (failure-to-issue pipeline)
  | 'feature:permanently-blocked'
  | 'issue:created'
  | 'issue:triage-completed'
  // Escalation router events (signal routing to channels)
  | 'escalation:signal-received'
  | 'escalation:signal-routed'
  | 'escalation:signal-sent'
  | 'escalation:signal-failed'
  | 'escalation:signal-deduplicated'
  | 'escalation:acknowledged'
  | 'escalation:ui-notification'
  // Feedback analytics events (pattern detection and metrics)
  | 'feedback:pattern-detected'
  // Signal routing events (signal intake and routing)
  | 'signal:received'
  | 'signal:routed'
  // GTM content pipeline events (content creation flow)
  | 'authority:gtm-signal-received'
  | 'authority:gtm-research-started'
  | 'authority:gtm-draft-started'
  | 'content:draft-ready'
  | 'content:draft-approved'
  | 'content:draft-rejected'
  | 'content:changes-requested'
  // Metrics ledger events (persistent analytics)
  | 'ledger:record-written'
  | 'ledger:backfill-completed'
  | 'ledger:enrichment-completed'
  // Feature archival events (board cleanup)
  | 'feature:archived'
  | 'archival:cycle-completed'
  // GitHub PR state change events (emitted by GitHubStateChecker)
  | 'github:pr:review-submitted'
  | 'github:pr:checks-updated'
  | 'github:pr:approved'
  | 'github:pr:changes-requested'
  // GitHub state drift events (PR to Linear sync bridge)
  | 'github-state-drift'
  // Project lifecycle events (Linear as source of truth)
  | 'project:lifecycle:initiated'
  | 'project:lifecycle:prd-generated'
  | 'project:lifecycle:prd-approved'
  | 'project:lifecycle:launched'
  | 'project:lifecycle:completed'
  | 'project:lifecycle:phase-changed'
  // Lead Engineer events (production-phase nerve center)
  | 'lead-engineer:started'
  | 'lead-engineer:stopped'
  | 'lead-engineer:feature-processed'
  | 'lead-engineer:action-executed'
  | 'lead-engineer:rule-evaluated'
  | 'lead-engineer:project-completing'
  | 'lead-engineer:project-completed'
  // Notes workspace events (agent-initiated tab mutations)
  | 'notes:tab-created'
  | 'notes:tab-deleted'
  | 'notes:tab-renamed'
  | 'notes:tab-updated'
  | 'notes:tab-permissions-changed'
  // Twitch integration events
  | 'twitch:connection'
  | 'twitch:suggestion:updated'
  | 'twitch:suggestion:built'
  | 'twitch:poll:created'
  // Voice activation events
  | 'voice:transcription'
  | 'voice:wake-word-detected'
  | 'voice:command-received'
  | 'voice:model-download-progress'
  // Pipeline state machine events (goal gates, checkpoints, loop detection, supervisor)
  | 'pipeline:state-entered'
  | 'pipeline:goal-gate-evaluated'
  | 'pipeline:checkpoint-saved'
  | 'pipeline:loop-detected'
  | 'pipeline:supervisor-action'
  // Unified pipeline orchestrator events (idea-to-production phases)
  | 'pipeline:phase-entered'
  | 'pipeline:phase-completed'
  | 'pipeline:gate-waiting'
  | 'pipeline:gate-resolved'
  | 'pipeline:phase-skipped'
  | 'pipeline:trace-linked'
  // HITL form events (human-in-the-loop structured input)
  | 'hitl:form-requested'
  | 'hitl:form-responded'
  // Ava Gateway heartbeat events (board health monitoring + circuit breaker)
  | 'ava-gateway:alerts'
  | 'ava-gateway:heartbeat-ok'
  | 'ava-gateway:emergency-stop'
  // Server lifecycle events
  | 'server:shutdown';

export type EventCallback = (type: EventType, payload: unknown) => void;

/**
 * Event severity levels for classification and filtering
 */
export type EventSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * PR Remediation Event Payloads
 * Used by the PR maintenance workflow to track thread resolution and feedback processing
 */

/**
 * pr:remediation-started - Fired when PR remediation workflow begins
 * Triggered when an agent is spawned to address PR feedback or review comments
 */
export interface PRRemediationStartedPayload {
  /** Feature ID being remediated */
  featureId: string;
  /** PR number in GitHub */
  prNumber: number;
  /** Number of review threads requiring attention */
  threadCount: number;
  /** Agent ID spawned for remediation */
  agentId?: string;
  /** Timestamp when remediation started */
  timestamp: string;
}

/**
 * pr:thread-evaluated - Fired when a single PR review thread is evaluated
 * Indicates whether a thread has been addressed and can be resolved
 */
export interface PRThreadEvaluatedPayload {
  /** Feature ID being remediated */
  featureId: string;
  /** PR number in GitHub */
  prNumber: number;
  /** Thread/comment ID being evaluated */
  threadId: string;
  /** Whether the thread is ready to be resolved */
  canResolve: boolean;
  /** Reason for resolution status (e.g., "changes committed", "not addressed yet") */
  reason?: string;
  /** Timestamp of evaluation */
  timestamp: string;
}

/**
 * pr:threads-resolved - Fired when all PR review threads are marked as resolved
 * Signals that PR is ready for re-review or approval
 */
export interface PRThreadsResolvedPayload {
  /** Feature ID being remediated */
  featureId: string;
  /** PR number in GitHub */
  prNumber: number;
  /** Total number of threads resolved */
  resolvedCount: number;
  /** Whether PR is now ready for approval */
  readyForReview: boolean;
  /** Timestamp when all threads were resolved */
  timestamp: string;
}

/**
 * GitHub PR State Change Event Payloads
 * Emitted by GitHubStateChecker when PR state changes are detected
 */

/**
 * github:pr:review-submitted - Fired when a new review is submitted on a PR
 */
export interface GitHubPRReviewSubmittedPayload {
  /** Project path */
  projectPath: string;
  /** Feature ID associated with the PR */
  featureId: string;
  /** PR number in GitHub */
  prNumber: number;
  /** Branch name */
  branchName: string;
  /** Review state (APPROVED, CHANGES_REQUESTED, COMMENTED) */
  reviewState: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  /** Timestamp of the event */
  timestamp: string;
}

/**
 * github:pr:checks-updated - Fired when CI checks status changes
 */
export interface GitHubPRChecksUpdatedPayload {
  /** Project path */
  projectPath: string;
  /** Feature ID associated with the PR */
  featureId: string;
  /** PR number in GitHub */
  prNumber: number;
  /** Branch name */
  branchName: string;
  /** CI status (success, failure, pending, error) */
  ciStatus: 'success' | 'failure' | 'pending' | 'error';
  /** Failed checks if any */
  failedChecks?: Array<{
    name: string;
    conclusion: string;
  }>;
  /** Timestamp of the event */
  timestamp: string;
}

/**
 * github:pr:approved - Fired when a PR receives approval
 */
export interface GitHubPRApprovedPayload {
  /** Project path */
  projectPath: string;
  /** Feature ID associated with the PR */
  featureId: string;
  /** PR number in GitHub */
  prNumber: number;
  /** Branch name */
  branchName: string;
  /** Number of approvals */
  approvalCount: number;
  /** Timestamp of the event */
  timestamp: string;
}

/**
 * github:pr:changes-requested - Fired when changes are requested on a PR
 */
export interface GitHubPRChangesRequestedPayload {
  /** Project path */
  projectPath: string;
  /** Feature ID associated with the PR */
  featureId: string;
  /** PR number in GitHub */
  prNumber: number;
  /** Branch name */
  branchName: string;
  /** Timestamp of the event */
  timestamp: string;
}

/**
 * Maps specific EventType values to their payload types.
 * Events without an explicit entry default to Record<string, unknown>.
 */
export interface EventPayloadMap {
  // PR remediation events
  'pr:remediation-started': PRRemediationStartedPayload;
  'pr:thread-evaluated': PRThreadEvaluatedPayload;
  'pr:threads-resolved': PRThreadsResolvedPayload;

  // GitHub PR state events
  'github:pr:review-submitted': GitHubPRReviewSubmittedPayload;
  'github:pr:checks-updated': GitHubPRChecksUpdatedPayload;
  'github:pr:approved': GitHubPRApprovedPayload;
  'github:pr:changes-requested': GitHubPRChangesRequestedPayload;

  // Feature lifecycle
  'feature:started': { featureId: string; featureTitle?: string; projectPath?: string };
  'feature:completed': { featureId: string; featureTitle?: string; projectPath?: string };
  'feature:stopped': { featureId: string; featureTitle?: string; projectPath?: string };
  'feature:error': {
    featureId: string;
    featureTitle?: string;
    error?: string;
    projectPath?: string;
  };
  'feature:retry': {
    featureId: string;
    featureTitle?: string;
    attempt?: number;
    projectPath?: string;
  };
  'feature:committed': { featureId: string; featureTitle?: string; projectPath?: string };
  'feature:pr-merged': {
    featureId: string;
    featureTitle?: string;
    prNumber?: number;
    projectPath?: string;
  };
  'feature:status-changed': {
    featureId: string;
    oldStatus?: string;
    newStatus?: string;
    projectPath?: string;
  };
  'feature:updated': {
    featureId: string;
    projectPath: string;
    previousTitle?: string;
    newTitle?: string;
    previousDescription?: string;
    newDescription?: string;
  };

  // Auto-mode events
  'auto-mode:started': { projectPath?: string };
  'auto-mode:stopped': { projectPath?: string; reason?: string };
  'auto-mode:idle': { projectPath?: string };

  // Health events
  'health:issue-detected': { message?: string; severity?: string };
  'health:issue-remediated': { message?: string };

  // Milestone/project lifecycle
  'milestone:completed': { milestone?: string; projectPath?: string };
  'project:completed': { project?: string; projectPath?: string };
  'project:prd:changes-requested': {
    projectSlug: string;
    projectPath: string;
    feedback: string;
  };

  // Lead Engineer events
  'lead-engineer:started': { projectPath: string; projectSlug: string };
  'lead-engineer:stopped': { projectPath: string; projectSlug: string };
  'lead-engineer:action-executed': {
    projectPath: string;
    actionType: string;
    details?: Record<string, unknown>;
  };
  'lead-engineer:rule-evaluated': {
    projectPath: string;
    ruleName: string;
    eventType: string;
    actionCount: number;
  };
  'lead-engineer:feature-processed': {
    projectPath: string;
    featureId: string;
    finalState: string;
    success: boolean;
  };
  'lead-engineer:project-completing': { projectPath: string; projectSlug: string };
  'lead-engineer:project-completed': { projectPath: string; projectSlug: string };

  // Linear sync conflict event (manual resolution required)
  'linear:sync:conflict': {
    featureId: string;
    projectPath: string;
    /** The Linear status that would have been applied */
    linearState: string;
    /** The current Automaker status */
    automakerStatus: string;
    /** HITL form ID, set when the form was created successfully */
    hitlFormId?: string;
    /** ISO-8601 timestamp */
    timestamp: string;
  };

  // HITL form events
  'hitl:form-requested': {
    formId: string;
    title: string;
    callerType: HITLFormCallerType;
    featureId?: string;
    projectPath?: string;
    stepCount: number;
    expiresAt: string;
  };
  'hitl:form-responded': {
    formId: string;
    callerType: HITLFormCallerType;
    featureId?: string;
    projectPath?: string;
    cancelled: boolean;
    flowThreadId?: string;
    response?: Record<string, unknown>[];
  };

  // Pipeline state machine events
  'pipeline:state-entered': {
    featureId: string;
    state: string;
    fromState: string | null;
    timestamp: string;
  };
  'pipeline:goal-gate-evaluated': {
    featureId: string;
    gateId: string;
    passed: boolean;
    reason: string;
  };
  'pipeline:checkpoint-saved': {
    featureId: string;
    state: string;
    checkpointId: string;
  };
  'pipeline:loop-detected': {
    featureId: string;
    loopSignature: string;
    actionTaken: string;
  };
  'pipeline:supervisor-action': {
    featureId: string;
    action: string;
    reason: string;
  };

  // Unified pipeline orchestrator events
  'pipeline:phase-entered': {
    featureId: string;
    projectPath: string;
    phase: PipelinePhase;
    branch: 'ops' | 'gtm';
    timestamp: string;
  };
  'pipeline:phase-completed': {
    featureId: string;
    projectPath: string;
    phase: PipelinePhase;
    branch: 'ops' | 'gtm';
    durationMs?: number;
    timestamp: string;
  };
  'pipeline:gate-waiting': {
    featureId: string;
    projectPath: string;
    phase: PipelinePhase;
    branch: 'ops' | 'gtm';
    gateMode: 'auto' | 'manual' | 'review';
    artifacts?: Record<string, unknown>;
    timestamp: string;
  };
  'pipeline:gate-resolved': {
    featureId: string;
    projectPath: string;
    phase: PipelinePhase;
    branch: 'ops' | 'gtm';
    resolvedBy: 'auto' | 'user' | 'system';
    action: 'advance' | 'reject';
    timestamp: string;
  };
  'pipeline:phase-skipped': {
    featureId: string;
    projectPath: string;
    phase: PipelinePhase;
    branch: 'ops' | 'gtm';
    reason: string;
    timestamp: string;
  };
  'pipeline:trace-linked': {
    featureId: string;
    projectPath: string;
    traceId: string;
    phase?: PipelinePhase;
    spanId?: string;
    timestamp: string;
  };
}

/**
 * Get the payload type for a specific event. Falls back to Record<string, unknown>
 * for events without explicit payload types.
 */
export type EventPayload<T extends EventType> = T extends keyof EventPayloadMap
  ? EventPayloadMap[T]
  : Record<string, unknown>;

/**
 * Typed callback for a specific event type.
 */
export type TypedEventCallback<T extends EventType> = (payload: EventPayload<T>) => void;
