/**
 * Event Settings - Custom actions triggered by system events
 *
 * Covers event hook triggers, action types (shell, HTTP, Discord),
 * and hook configuration for automating responses to system events.
 */

// ============================================================================
// Event Hook Triggers - Event types that can trigger custom hooks
// ============================================================================

/**
 * EventHookTrigger - Event types that can trigger custom hooks
 *
 * Core feature lifecycle:
 * - feature_created: A new feature was created
 * - feature_started: A feature agent started running
 * - feature_completed: A feature completed execution (maps to feature:completed)
 * - feature_stopped: A feature was stopped
 * - feature_committed: A feature committed its changes
 * - feature_pr_merged: A feature PR was merged
 * - feature_pr_closed_unmerged: A feature PR was closed without merging
 * - feature_success: Feature completed successfully (via auto-mode event)
 * - feature_error: Feature failed with an error
 * - feature_retry: Feature is being retried after a failure
 * - feature_recovery: A recovery action was taken for a feature
 * - feature_blocked: A feature was blocked
 * - feature_unblocked: A feature was unblocked
 * - feature_status_changed: A feature status changed
 * - feature_permanently_blocked: A feature is permanently blocked
 * - feature_agent_suggested: An agent was suggested for a feature
 *
 * Auto-mode:
 * - auto_mode_started: Auto mode started
 * - auto_mode_stopped: Auto mode stopped
 * - auto_mode_complete: Auto mode finished processing all features
 * - auto_mode_error: Auto mode encountered a critical error and paused
 * - auto_mode_health_check: Periodic health status check
 *
 * PR lifecycle:
 * - pr_approved: A PR was approved
 * - pr_changes_requested: Changes were requested on a PR
 * - pr_ci_failure: CI checks failed on a PR
 * - pr_remediation_started: PR remediation workflow began
 * - pr_remediation_completed: PR remediation completed successfully
 * - pr_remediation_failed: PR remediation failed
 * - pr_feedback_received: Pull request received feedback that needs addressing
 *
 * Ceremony events:
 * - ceremony_milestone_update: A milestone update ceremony was triggered
 * - ceremony_project_retro: A project retrospective ceremony was triggered
 * - ceremony_triggered: A ceremony was triggered
 *
 * Infrastructure / health:
 * - worktree_drift_detected: Worktree drift was detected
 * - health_issue_detected: A health issue was detected
 * - health_check_critical: Health check detected critical or degraded status
 *
 * Headsdown agents:
 * - headsdown_agent_started: A headsdown agent started
 * - headsdown_agent_stopped: A headsdown agent stopped
 * - headsdown_agent_work_completed: A headsdown agent completed work
 * - headsdown_agent_work_failed: A headsdown agent failed
 *
 * Integrations:
 * - coderabbit_review_received: CodeRabbit posted a review
 * - discord_message_detected: A Discord message was detected
 *
 * Project / planning:
 * - skill_created: An agent created a new reusable skill
 * - memory_learning: A new learning was recorded from agent execution
 * - issue_created: An issue was created
 * - prd_created: A PRD was created
 * - project_scaffolded: A project was scaffolded and features were created
 * - project_deleted: A project was deleted
 * - project_analysis_completed: Project analysis completed
 * - project_status_changed: A project status changed
 * - milestone_completed: A milestone was completed
 * - project_completed: A project was completed
 */
export type EventHookTrigger =
  // Core feature lifecycle
  | 'feature_created'
  | 'feature_started'
  | 'feature_completed'
  | 'feature_stopped'
  | 'feature_committed'
  | 'feature_pr_merged'
  | 'feature_pr_closed_unmerged'
  | 'feature_success'
  | 'feature_error'
  | 'feature_retry'
  | 'feature_recovery'
  | 'feature_blocked'
  | 'feature_unblocked'
  | 'feature_status_changed'
  | 'feature_permanently_blocked'
  | 'feature_agent_suggested'
  // Auto-mode
  | 'auto_mode_started'
  | 'auto_mode_stopped'
  | 'auto_mode_complete'
  | 'auto_mode_error'
  | 'auto_mode_health_check'
  // PR lifecycle
  | 'pr_approved'
  | 'pr_changes_requested'
  | 'pr_ci_failure'
  | 'pr_remediation_started'
  | 'pr_remediation_completed'
  | 'pr_remediation_failed'
  | 'pr_feedback_received'
  // Ceremony events
  | 'ceremony_milestone_update'
  | 'ceremony_project_retro'
  | 'ceremony_triggered'
  // Infrastructure / health
  | 'worktree_drift_detected'
  | 'health_issue_detected'
  | 'health_check_critical'
  // Headsdown agents
  | 'headsdown_agent_started'
  | 'headsdown_agent_stopped'
  | 'headsdown_agent_work_completed'
  | 'headsdown_agent_work_failed'
  // Integrations
  | 'coderabbit_review_received'
  | 'discord_message_detected'
  // Project / planning
  | 'skill_created'
  | 'memory_learning'
  | 'issue_created'
  | 'prd_created'
  | 'project_scaffolded'
  | 'project_deleted'
  | 'project_analysis_completed'
  | 'project_status_changed'
  | 'milestone_completed'
  | 'project_completed';

/** HTTP methods supported for webhook requests */
export type EventHookHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

// ============================================================================
// Event Hook Actions - Configuration for each action type
// ============================================================================

/**
 * EventHookShellAction - Configuration for executing a shell command
 *
 * Shell commands are executed in the server's working directory.
 * Supports variable substitution using {{variableName}} syntax.
 */
export interface EventHookShellAction {
  type: 'shell';
  /** Shell command to execute. Supports {{variable}} substitution. */
  command: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * EventHookHttpAction - Configuration for making an HTTP webhook request
 *
 * Supports variable substitution in URL, headers, and body.
 */
export interface EventHookHttpAction {
  type: 'http';
  /** URL to send the request to. Supports {{variable}} substitution. */
  url: string;
  /** HTTP method to use */
  method: EventHookHttpMethod;
  /** Optional headers to include. Values support {{variable}} substitution. */
  headers?: Record<string, string>;
  /** Optional request body (JSON string). Supports {{variable}} substitution. */
  body?: string;
}

/**
 * EventHookDiscordAction - Configuration for sending a Discord message via MCP
 *
 * Sends notifications to Discord channels using the Discord MCP server.
 * Supports variable substitution in all string fields.
 */
export interface EventHookDiscordAction {
  type: 'discord';
  /** Discord channel ID or name to send message to. Supports {{variable}} substitution. */
  channelId: string;
  /** Message content to send. Supports {{variable}} substitution and Discord markdown. */
  message: string;
  /** Optional username override for the webhook (if using webhook method) */
  username?: string;
  /** Optional avatar URL override for the webhook (if using webhook method) */
  avatarUrl?: string;
}

/** Union type for all hook action configurations */
export type EventHookAction = EventHookShellAction | EventHookHttpAction | EventHookDiscordAction;

// ============================================================================
// Event Hook Configuration
// ============================================================================

/**
 * EventHook - Configuration for a single event hook
 *
 * Event hooks allow users to execute custom shell commands or HTTP requests
 * when specific events occur in the system.
 *
 * Available variables for substitution:
 * - {{featureId}} - ID of the feature (if applicable)
 * - {{featureName}} - Name of the feature (if applicable)
 * - {{projectPath}} - Absolute path to the project
 * - {{projectName}} - Name of the project
 * - {{projectSlug}} - Project slug (project events)
 * - {{projectTitle}} - Project title (project events)
 * - {{milestoneCount}} - Milestone count (project_scaffolded)
 * - {{featuresCreated}} - Features created (project_scaffolded)
 * - {{error}} - Error message (for error events)
 * - {{timestamp}} - ISO timestamp of the event
 * - {{eventType}} - The event type that triggered the hook
 */
export interface EventHook {
  /** Unique identifier for this hook */
  id: string;
  /** Which event type triggers this hook */
  trigger: EventHookTrigger;
  /** Whether this hook is currently enabled */
  enabled: boolean;
  /** The action to execute when triggered */
  action: EventHookAction;
  /** Optional friendly name for display */
  name?: string;
}

/** Human-readable labels for event hook triggers */
export const EVENT_HOOK_TRIGGER_LABELS: Record<EventHookTrigger, string> = {
  // Core feature lifecycle
  feature_created: 'Feature created',
  feature_started: 'Feature agent started',
  feature_completed: 'Feature execution completed',
  feature_stopped: 'Feature stopped',
  feature_committed: 'Feature changes committed',
  feature_pr_merged: 'Feature PR merged',
  feature_pr_closed_unmerged: 'Feature PR closed without merging',
  feature_success: 'Feature completed successfully',
  feature_error: 'Feature failed with error',
  feature_retry: 'Feature retry initiated',
  feature_recovery: 'Feature recovery action taken',
  feature_blocked: 'Feature blocked',
  feature_unblocked: 'Feature unblocked',
  feature_status_changed: 'Feature status changed',
  feature_permanently_blocked: 'Feature permanently blocked',
  feature_agent_suggested: 'Agent suggested for feature',
  // Auto-mode
  auto_mode_started: 'Auto mode started',
  auto_mode_stopped: 'Auto mode stopped',
  auto_mode_complete: 'Auto mode completed all features',
  auto_mode_error: 'Auto mode paused due to error',
  auto_mode_health_check: 'Auto mode health check',
  // PR lifecycle
  pr_approved: 'PR approved',
  pr_changes_requested: 'PR changes requested',
  pr_ci_failure: 'PR CI checks failed',
  pr_remediation_started: 'PR remediation started',
  pr_remediation_completed: 'PR remediation completed',
  pr_remediation_failed: 'PR remediation failed',
  pr_feedback_received: 'PR feedback received',
  // Ceremony events
  ceremony_milestone_update: 'Milestone update ceremony triggered',
  ceremony_project_retro: 'Project retrospective ceremony triggered',
  ceremony_triggered: 'Ceremony triggered',
  // Infrastructure / health
  worktree_drift_detected: 'Worktree drift detected',
  health_issue_detected: 'Health issue detected',
  health_check_critical: 'Health check critical',
  // Headsdown agents
  headsdown_agent_started: 'Headsdown agent started',
  headsdown_agent_stopped: 'Headsdown agent stopped',
  headsdown_agent_work_completed: 'Headsdown agent work completed',
  headsdown_agent_work_failed: 'Headsdown agent work failed',
  // Integrations
  coderabbit_review_received: 'CodeRabbit review received',
  discord_message_detected: 'Discord message detected',
  // Project / planning
  skill_created: 'New skill created by agent',
  memory_learning: 'New learning recorded',
  issue_created: 'Issue created',
  prd_created: 'PRD created',
  project_scaffolded: 'Project scaffolded with features',
  project_deleted: 'Project deleted',
  project_analysis_completed: 'Project analysis completed',
  project_status_changed: 'Project status changed',
  milestone_completed: 'Milestone completed',
  project_completed: 'Project completed',
};
