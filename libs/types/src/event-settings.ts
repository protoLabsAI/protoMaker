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
 * - feature_created: A new feature was created
 * - feature_success: Feature completed successfully
 * - feature_error: Feature failed with an error
 * - feature_retry: Feature is being retried after a failure
 * - feature_recovery: A recovery action was taken for a feature
 * - auto_mode_complete: Auto mode finished processing all features
 * - auto_mode_error: Auto mode encountered a critical error and paused
 * - auto_mode_health_check: Periodic health status check
 * - skill_created: An agent created a new reusable skill
 * - memory_learning: A new learning was recorded from agent execution
 * - pr_feedback_received: Pull request received feedback that needs addressing
 * - project_scaffolded: A project was scaffolded and features were created
 * - project_deleted: A project was deleted
 * - health_check_critical: Health check detected critical or degraded status
 */
export type EventHookTrigger =
  | 'feature_created'
  | 'feature_success'
  | 'feature_error'
  | 'feature_retry'
  | 'feature_recovery'
  | 'auto_mode_complete'
  | 'auto_mode_error'
  | 'auto_mode_health_check'
  | 'skill_created'
  | 'memory_learning'
  | 'pr_feedback_received'
  | 'project_scaffolded'
  | 'project_deleted'
  | 'milestone_completed'
  | 'project_completed'
  | 'health_check_critical';

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
  feature_created: 'Feature created',
  feature_success: 'Feature completed successfully',
  feature_error: 'Feature failed with error',
  feature_retry: 'Feature retry initiated',
  feature_recovery: 'Feature recovery action taken',
  auto_mode_complete: 'Auto mode completed all features',
  auto_mode_error: 'Auto mode paused due to error',
  auto_mode_health_check: 'Auto mode health check',
  skill_created: 'New skill created by agent',
  memory_learning: 'New learning recorded',
  pr_feedback_received: 'PR feedback received',
  project_scaffolded: 'Project scaffolded with features',
  project_deleted: 'Project deleted',
  milestone_completed: 'Milestone completed',
  project_completed: 'Project completed',
  health_check_critical: 'Health check critical',
};
