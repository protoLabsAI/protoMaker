/**
 * Event Hook Service - Executes custom actions when system events occur
 *
 * Listens to the event emitter and triggers configured hooks:
 * - Shell commands: Executed with configurable timeout
 * - HTTP webhooks: POST/GET/PUT/PATCH requests with variable substitution
 * - Discord messages: Sent via Discord MCP server
 *
 * Also stores events to history for debugging and replay.
 *
 * Supported events:
 * - feature_created: A new feature was created
 * - feature_success: Feature completed successfully
 * - feature_error: Feature failed with an error
 * - feature_retry: Feature is being retried after a failure
 * - feature_recovery: A recovery action was taken for a feature
 * - auto_mode_complete: Auto mode finished all features (idle state)
 * - auto_mode_error: Auto mode encountered a critical error
 * - auto_mode_health_check: Periodic health status check
 * - skill_created: An agent created a new reusable skill
 * - memory_learning: A new learning was recorded from agent execution
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { EventHistoryService } from './event-history-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { DiscordBotService } from './discord-bot-service.js';
import type {
  EventHook,
  EventHookTrigger,
  EventHookShellAction,
  EventHookHttpAction,
  EventHookDiscordAction,
  EventSeverity,
} from '@protolabsai/types';

const execAsync = promisify(exec);
const logger = createLogger('EventHooks');

/**
 * Mapping from EventType strings to EventHookTrigger for the expanded trigger set.
 * Events handled by dedicated methods above are excluded to avoid double-firing.
 */
const GENERIC_EVENT_TYPE_TO_TRIGGER: Partial<Record<string, EventHookTrigger>> = {
  // Feature lifecycle
  'feature:started': 'feature_started',
  'feature:completed': 'feature_completed',
  'feature:stopped': 'feature_stopped',
  'feature:committed': 'feature_committed',
  'feature:pr-merged': 'feature_pr_merged',
  'feature:pr-closed-unmerged': 'feature_pr_closed_unmerged',
  'feature:blocked': 'feature_blocked',
  'feature:unblocked': 'feature_unblocked',
  'feature:status-changed': 'feature_status_changed',
  'feature:permanently-blocked': 'feature_permanently_blocked',
  'feature:agent-suggested': 'feature_agent_suggested',
  // Auto-mode
  'auto-mode:started': 'auto_mode_started',
  'auto-mode:stopped': 'auto_mode_stopped',
  // PR lifecycle
  'pr:approved': 'pr_approved',
  'pr:changes-requested': 'pr_changes_requested',
  'pr:ci-failure': 'pr_ci_failure',
  'pr:remediation-started': 'pr_remediation_started',
  'pr:remediation-completed': 'pr_remediation_completed',
  'pr:remediation-failed': 'pr_remediation_failed',
  // Ceremony events
  'ceremony:milestone-update': 'ceremony_milestone_update',
  'ceremony:project-retro': 'ceremony_project_retro',
  'ceremony:triggered': 'ceremony_triggered',
  // Infrastructure / health
  'worktree:drift-detected': 'worktree_drift_detected',
  'health:issue-detected': 'health_issue_detected',
  // Headsdown agents
  'headsdown:agent:started': 'headsdown_agent_started',
  'headsdown:agent:stopped': 'headsdown_agent_stopped',
  'headsdown:agent:work-completed': 'headsdown_agent_work_completed',
  'headsdown:agent:work-failed': 'headsdown_agent_work_failed',
  // Integrations
  'coderabbit:review-received': 'coderabbit_review_received',
  'discord:message:detected': 'discord_message_detected',
  // Project / planning
  'issue:created': 'issue_created',
  'prd:created': 'prd_created',
  'project:analysis-completed': 'project_analysis_completed',
  'project:status-changed': 'project_status_changed',
  // Milestone / project completion (not handled via auto-mode:event)
  'milestone:completed': 'milestone_completed',
  'project:completed': 'project_completed',
};

/**
 * Classify event severity based on trigger type
 *
 * Classification rules:
 * - Critical: feature_error, auto_mode_error, health_check_critical
 * - High: feature_success, auto_mode_complete
 * - Medium: feature_created, feature_retry, feature_recovery
 * - Low: everything else (auto_mode_health_check, skill_created, memory_learning, pr_feedback_received, project_scaffolded, project_deleted)
 */
function classifySeverity(trigger: EventHookTrigger): EventSeverity {
  // Critical events - require immediate attention
  if (
    trigger === 'feature_error' ||
    trigger === 'auto_mode_error' ||
    trigger === 'health_check_critical' ||
    trigger === 'feature_permanently_blocked' ||
    trigger === 'feature_pr_closed_unmerged' ||
    trigger === 'headsdown_agent_work_failed' ||
    trigger === 'pr_ci_failure'
  ) {
    return 'critical';
  }

  // High priority events - important successes and completions
  if (
    trigger === 'feature_success' ||
    trigger === 'auto_mode_complete' ||
    trigger === 'feature_completed' ||
    trigger === 'feature_pr_merged' ||
    trigger === 'pr_approved' ||
    trigger === 'headsdown_agent_work_completed' ||
    trigger === 'pr_remediation_completed' ||
    trigger === 'auto_mode_started'
  ) {
    return 'high';
  }

  // Medium priority events - routine state changes and recoveries
  if (
    trigger === 'feature_created' ||
    trigger === 'feature_retry' ||
    trigger === 'feature_recovery' ||
    trigger === 'feature_started' ||
    trigger === 'feature_stopped' ||
    trigger === 'feature_committed' ||
    trigger === 'feature_blocked' ||
    trigger === 'feature_unblocked' ||
    trigger === 'pr_changes_requested' ||
    trigger === 'pr_remediation_started' ||
    trigger === 'ceremony_triggered' ||
    trigger === 'ceremony_milestone_update' ||
    trigger === 'ceremony_project_retro' ||
    trigger === 'auto_mode_stopped'
  ) {
    return 'medium';
  }

  // Low priority - everything else (informational)
  return 'low';
}

/** Default timeout for shell commands (30 seconds) */
const DEFAULT_SHELL_TIMEOUT = 30000;

/** Default timeout for HTTP requests (10 seconds) */
const DEFAULT_HTTP_TIMEOUT = 10000;

/**
 * Context available for variable substitution in hooks
 */
interface HookContext {
  featureId?: string;
  featureName?: string;
  projectPath?: string;
  projectName?: string;
  error?: string;
  errorType?: string;
  timestamp: string;
  eventType: EventHookTrigger;
  // Retry/Recovery specific fields
  retryCount?: number;
  recoveryStrategy?: string;
  // Skill specific fields
  skillName?: string;
  skillPath?: string;
  // Memory/Learning specific fields
  learningContent?: string;
  memoryFilePath?: string;
  // Health check specific fields
  healthStatus?: string;
  healthDetails?: string;
  // Project specific fields
  projectSlug?: string;
  projectTitle?: string;
  milestoneCount?: number;
  featuresCreated?: number;
}

/**
 * Auto-mode event payload structure
 */
interface AutoModeEventPayload {
  type?: string;
  featureId?: string;
  featureName?: string;
  passes?: boolean;
  message?: string;
  error?: string;
  errorType?: string;
  projectPath?: string;
}

/**
 * Feature created event payload structure
 */
interface FeatureCreatedPayload {
  featureId: string;
  featureName?: string;
  projectPath: string;
}

/**
 * Feature retry event payload structure
 */
export interface FeatureRetryPayload {
  featureId: string;
  featureName?: string;
  projectPath: string;
  retryCount: number;
  error?: string;
  errorType?: string;
}

/**
 * Feature recovery event payload structure
 */
export interface FeatureRecoveryPayload {
  featureId: string;
  featureName?: string;
  projectPath: string;
  recoveryStrategy: string;
  error?: string;
  errorType?: string;
}

/**
 * Skill created event payload structure
 */
export interface SkillCreatedPayload {
  skillName: string;
  skillPath: string;
  projectPath: string;
}

/**
 * Memory learning event payload structure
 */
export interface MemoryLearningPayload {
  featureId?: string;
  featureName?: string;
  projectPath: string;
  learningContent: string;
  memoryFilePath: string;
}

/**
 * Health check event payload structure
 */
export interface HealthCheckPayload {
  projectPath: string;
  status: 'healthy' | 'degraded' | 'critical';
  details?: string;
}

/**
 * Health check completed event payload structure (from health:check-completed)
 */
export interface HealthCheckCompletedPayload {
  projectPath?: string;
  status: 'healthy' | 'degraded' | 'critical';
  issues?: Array<{ type: string; severity: string; message: string }>;
  metrics?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Project scaffolded event payload structure
 */
export interface ProjectScaffoldedPayload {
  projectPath: string;
  projectSlug: string;
  projectTitle: string;
  milestoneCount: number;
  featuresCreated: number;
}

/**
 * Project deleted event payload structure
 */
export interface ProjectDeletedPayload {
  projectPath: string;
  projectSlug: string;
}

/**
 * Event Hook Service
 *
 * Manages execution of user-configured event hooks in response to system events.
 * Also stores events to history for debugging and replay.
 */
export class EventHookService {
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private eventHistoryService: EventHistoryService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private discordBotService: DiscordBotService | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize the service with event emitter, settings service, event history service, and feature loader
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    eventHistoryService?: EventHistoryService,
    featureLoader?: FeatureLoader,
    discordBotService?: DiscordBotService
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.eventHistoryService = eventHistoryService || null;
    this.featureLoader = featureLoader || null;
    this.discordBotService = discordBotService || null;

    // Subscribe to events
    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'auto-mode:event') {
        this.handleAutoModeEvent(payload as AutoModeEventPayload);
      } else if (type === 'feature:created') {
        this.handleFeatureCreatedEvent(payload as FeatureCreatedPayload);
      } else if (type === 'feature:retry') {
        this.handleFeatureRetryEvent(payload as FeatureRetryPayload);
      } else if (type === 'feature:recovery') {
        this.handleFeatureRecoveryEvent(payload as FeatureRecoveryPayload);
      } else if (type === 'skill:created') {
        this.handleSkillCreatedEvent(payload as SkillCreatedPayload);
      } else if (type === 'memory:learning') {
        this.handleMemoryLearningEvent(payload as MemoryLearningPayload);
      } else if (type === 'auto-mode:health-check') {
        this.handleHealthCheckEvent(payload as HealthCheckPayload);
      } else if (type === 'health:check-completed') {
        this.handleHealthCheckCompletedEvent(payload as HealthCheckCompletedPayload);
      } else if (type === 'project:scaffolded') {
        this.handleProjectScaffoldedEvent(payload as ProjectScaffoldedPayload);
      } else if (type === 'project:deleted') {
        this.handleProjectDeletedEvent(payload as ProjectDeletedPayload);
      } else {
        // Handle expanded trigger set via generic mapping
        const trigger = GENERIC_EVENT_TYPE_TO_TRIGGER[type];
        if (trigger) {
          void this.handleGenericEvent(trigger, payload as Record<string, unknown>);
        }
      }
    });

    logger.info('Event hook service initialized');
  }

  /**
   * Cleanup subscriptions
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.emitter = null;
    this.settingsService = null;
    this.eventHistoryService = null;
    this.featureLoader = null;
    this.discordBotService = null;
  }

  /**
   * Handle auto-mode events and trigger matching hooks
   */
  private async handleAutoModeEvent(payload: AutoModeEventPayload): Promise<void> {
    if (!payload.type) return;

    // Map internal event types to hook triggers
    let trigger: EventHookTrigger | null = null;

    switch (payload.type) {
      case 'auto_mode_feature_complete':
        trigger = payload.passes ? 'feature_success' : 'feature_error';
        break;
      case 'auto_mode_error':
        // Feature-level error (has featureId) vs auto-mode level error
        trigger = payload.featureId ? 'feature_error' : 'auto_mode_error';
        break;
      case 'auto_mode_idle':
        trigger = 'auto_mode_complete';
        break;
      default:
        // Other event types don't trigger hooks
        return;
    }

    if (!trigger) return;

    // Load feature name if we have featureId but no featureName
    let _featureName: string | undefined = undefined;
    if (payload.featureId && payload.projectPath && this.featureLoader) {
      try {
        const feature = await this.featureLoader.get(payload.projectPath, payload.featureId);
        if (feature?.title) {
          _featureName = feature.title;
        }
      } catch (error) {
        logger.warn(`Failed to load feature ${payload.featureId} for event hook:`, error);
      }
    }

    // Build context for variable substitution
    const context: HookContext = {
      featureId: payload.featureId,
      featureName: payload.featureName,
      projectPath: payload.projectPath,
      projectName: payload.projectPath ? this.extractProjectName(payload.projectPath) : undefined,
      error: payload.error || payload.message,
      errorType: payload.errorType,
      timestamp: new Date().toISOString(),
      eventType: trigger,
    };

    // Execute matching hooks (pass passes for feature completion events)
    await this.executeHooksForTrigger(trigger, context, { passes: payload.passes });
  }

  /**
   * Handle feature:created events and trigger matching hooks
   */
  private async handleFeatureCreatedEvent(payload: FeatureCreatedPayload): Promise<void> {
    const context: HookContext = {
      featureId: payload.featureId,
      featureName: payload.featureName,
      projectPath: payload.projectPath,
      projectName: this.extractProjectName(payload.projectPath),
      timestamp: new Date().toISOString(),
      eventType: 'feature_created',
    };

    await this.executeHooksForTrigger('feature_created', context);
  }

  /**
   * Handle feature:retry events and trigger matching hooks
   */
  private async handleFeatureRetryEvent(payload: FeatureRetryPayload): Promise<void> {
    const context: HookContext = {
      featureId: payload.featureId,
      featureName: payload.featureName,
      projectPath: payload.projectPath,
      projectName: this.extractProjectName(payload.projectPath),
      error: payload.error,
      errorType: payload.errorType,
      retryCount: payload.retryCount,
      timestamp: new Date().toISOString(),
      eventType: 'feature_retry',
    };

    await this.executeHooksForTrigger('feature_retry', context);
  }

  /**
   * Handle feature:recovery events and trigger matching hooks
   */
  private async handleFeatureRecoveryEvent(payload: FeatureRecoveryPayload): Promise<void> {
    const context: HookContext = {
      featureId: payload.featureId,
      featureName: payload.featureName,
      projectPath: payload.projectPath,
      projectName: this.extractProjectName(payload.projectPath),
      error: payload.error,
      errorType: payload.errorType,
      recoveryStrategy: payload.recoveryStrategy,
      timestamp: new Date().toISOString(),
      eventType: 'feature_recovery',
    };

    await this.executeHooksForTrigger('feature_recovery', context);
  }

  /**
   * Handle skill:created events and trigger matching hooks
   */
  private async handleSkillCreatedEvent(payload: SkillCreatedPayload): Promise<void> {
    const context: HookContext = {
      projectPath: payload.projectPath,
      projectName: this.extractProjectName(payload.projectPath),
      skillName: payload.skillName,
      skillPath: payload.skillPath,
      timestamp: new Date().toISOString(),
      eventType: 'skill_created',
    };

    await this.executeHooksForTrigger('skill_created', context);
  }

  /**
   * Handle memory:learning events and trigger matching hooks
   */
  private async handleMemoryLearningEvent(payload: MemoryLearningPayload): Promise<void> {
    const context: HookContext = {
      featureId: payload.featureId,
      featureName: payload.featureName,
      projectPath: payload.projectPath,
      projectName: this.extractProjectName(payload.projectPath),
      learningContent: payload.learningContent,
      memoryFilePath: payload.memoryFilePath,
      timestamp: new Date().toISOString(),
      eventType: 'memory_learning',
    };

    await this.executeHooksForTrigger('memory_learning', context);
  }

  /**
   * Handle auto-mode:health-check events and trigger matching hooks
   */
  private async handleHealthCheckEvent(payload: HealthCheckPayload): Promise<void> {
    const context: HookContext = {
      projectPath: payload.projectPath,
      projectName: this.extractProjectName(payload.projectPath),
      healthStatus: payload.status,
      healthDetails: payload.details,
      timestamp: new Date().toISOString(),
      eventType: 'auto_mode_health_check',
    };

    await this.executeHooksForTrigger('auto_mode_health_check', context);
  }

  /**
   * Handle project:scaffolded events and trigger matching hooks
   */
  private async handleProjectScaffoldedEvent(payload: ProjectScaffoldedPayload): Promise<void> {
    const context: HookContext = {
      projectPath: payload.projectPath,
      projectName: this.extractProjectName(payload.projectPath),
      projectSlug: payload.projectSlug,
      projectTitle: payload.projectTitle,
      milestoneCount: payload.milestoneCount,
      featuresCreated: payload.featuresCreated,
      timestamp: new Date().toISOString(),
      eventType: 'project_scaffolded',
    };

    await this.executeHooksForTrigger('project_scaffolded', context);
  }

  /**
   * Handle project:deleted events and trigger matching hooks
   */
  private async handleProjectDeletedEvent(payload: ProjectDeletedPayload): Promise<void> {
    const context: HookContext = {
      projectPath: payload.projectPath,
      projectName: this.extractProjectName(payload.projectPath),
      projectSlug: payload.projectSlug,
      timestamp: new Date().toISOString(),
      eventType: 'project_deleted',
    };

    await this.executeHooksForTrigger('project_deleted', context);
  }

  /**
   * Handle health:check-completed events and trigger matching hooks
   * Only triggers for critical or degraded status
   */
  private async handleHealthCheckCompletedEvent(
    payload: HealthCheckCompletedPayload
  ): Promise<void> {
    // Only trigger hooks for critical or degraded status
    if (payload.status !== 'critical' && payload.status !== 'degraded') {
      return;
    }

    // Build issue summary from issues array
    const issueSummary =
      payload.issues
        ?.map((issue) => `[${issue.severity}] ${issue.type}: ${issue.message}`)
        .join('; ') || 'No specific issues reported';

    const context: HookContext = {
      projectPath: payload.projectPath || '',
      projectName: payload.projectPath ? this.extractProjectName(payload.projectPath) : 'unknown',
      healthStatus: payload.status,
      healthDetails: issueSummary,
      timestamp: payload.timestamp || new Date().toISOString(),
      eventType: 'health_check_critical',
    };

    await this.executeHooksForTrigger('health_check_critical', context);
  }

  /**
   * Handle generic events using the GENERIC_EVENT_TYPE_TO_TRIGGER mapping.
   * Extracts common fields (featureId, projectPath, error) from the payload.
   */
  private async handleGenericEvent(
    trigger: EventHookTrigger,
    payload: Record<string, unknown>
  ): Promise<void> {
    const featureId = typeof payload.featureId === 'string' ? payload.featureId : undefined;
    const featureName =
      typeof payload.featureTitle === 'string'
        ? payload.featureTitle
        : typeof payload.featureName === 'string'
          ? payload.featureName
          : undefined;
    const projectPath = typeof payload.projectPath === 'string' ? payload.projectPath : undefined;
    const error = typeof payload.error === 'string' ? payload.error : undefined;

    const hookContext: HookContext = {
      featureId,
      featureName,
      projectPath,
      projectName: projectPath ? this.extractProjectName(projectPath) : undefined,
      error,
      timestamp: new Date().toISOString(),
      eventType: trigger,
    };

    await this.executeHooksForTrigger(trigger, hookContext);
  }

  /**
   * Execute all enabled hooks matching the given trigger and store event to history
   */
  private async executeHooksForTrigger(
    trigger: EventHookTrigger,
    context: HookContext,
    additionalData?: { passes?: boolean }
  ): Promise<void> {
    // Classify severity
    const severity = classifySeverity(trigger);

    // Store event to history (even if no hooks match)
    if (this.eventHistoryService && context.projectPath) {
      try {
        await this.eventHistoryService.storeEvent({
          trigger,
          severity,
          projectPath: context.projectPath,
          featureId: context.featureId,
          featureName: context.featureName,
          error: context.error,
          errorType: context.errorType,
          passes: additionalData?.passes,
        });
      } catch (error) {
        logger.error('Failed to store event to history:', error);
      }
    }

    if (!this.settingsService) {
      logger.warn('Settings service not available');
      return;
    }

    try {
      const settings = await this.settingsService.getGlobalSettings();
      const hooks = settings.eventHooks || [];

      // Filter to enabled hooks matching this trigger
      const matchingHooks = hooks.filter((hook) => hook.enabled && hook.trigger === trigger);

      if (matchingHooks.length === 0) {
        return;
      }

      logger.info(`Executing ${matchingHooks.length} hook(s) for trigger: ${trigger}`);

      // Execute hooks in parallel (don't wait for one to finish before starting next)
      await Promise.allSettled(matchingHooks.map((hook) => this.executeHook(hook, context)));
    } catch (error) {
      logger.error('Error executing hooks:', error);
    }
  }

  /**
   * Execute a single hook
   */
  private async executeHook(hook: EventHook, context: HookContext): Promise<void> {
    const hookName = hook.name || hook.id;

    try {
      if (hook.action.type === 'shell') {
        await this.executeShellHook(hook.action, context, hookName);
      } else if (hook.action.type === 'http') {
        await this.executeHttpHook(hook.action, context, hookName);
      } else if (hook.action.type === 'discord') {
        await this.executeDiscordHook(hook.action, context, hookName);
      }
    } catch (error) {
      logger.error(`Hook "${hookName}" failed:`, error);
    }
  }

  /**
   * Execute a shell command hook
   */
  private async executeShellHook(
    action: EventHookShellAction,
    context: HookContext,
    hookName: string
  ): Promise<void> {
    const command = this.substituteVariables(action.command, context);
    const timeout = action.timeout || DEFAULT_SHELL_TIMEOUT;

    logger.info(`Executing shell hook "${hookName}": ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
      });

      if (stdout) {
        logger.debug(`Hook "${hookName}" stdout: ${stdout.trim()}`);
      }
      if (stderr) {
        logger.warn(`Hook "${hookName}" stderr: ${stderr.trim()}`);
      }

      logger.info(`Shell hook "${hookName}" completed successfully`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
        logger.error(`Shell hook "${hookName}" timed out after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Execute an HTTP webhook hook
   */
  private async executeHttpHook(
    action: EventHookHttpAction,
    context: HookContext,
    hookName: string
  ): Promise<void> {
    const url = this.substituteVariables(action.url, context);
    const method = action.method || 'POST';

    // Substitute variables in headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (action.headers) {
      for (const [key, value] of Object.entries(action.headers)) {
        headers[key] = this.substituteVariables(value, context);
      }
    }

    // Substitute variables in body
    let body: string | undefined;
    if (action.body) {
      body = this.substituteVariables(action.body, context);
    } else if (method !== 'GET') {
      // Default body with context information
      body = JSON.stringify({
        eventType: context.eventType,
        timestamp: context.timestamp,
        featureId: context.featureId,
        featureName: context.featureName,
        projectPath: context.projectPath,
        projectName: context.projectName,
        error: context.error,
      });
    }

    logger.info(`Executing HTTP hook "${hookName}": ${method} ${url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_HTTP_TIMEOUT);

      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' ? body : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn(`HTTP hook "${hookName}" received status ${response.status}`);
      } else {
        logger.info(`HTTP hook "${hookName}" completed successfully (status: ${response.status})`);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.error(`HTTP hook "${hookName}" timed out after ${DEFAULT_HTTP_TIMEOUT}ms`);
      }
      throw error;
    }
  }

  /**
   * Execute a Discord message hook via DiscordBotService.
   * Critical and error events are sent as embeds; others as plain messages.
   */
  private async executeDiscordHook(
    action: EventHookDiscordAction,
    context: HookContext,
    hookName: string
  ): Promise<void> {
    const channelId = this.substituteVariables(action.channelId, context);
    const message = this.substituteVariables(action.message, context);

    logger.info(`Executing Discord hook "${hookName}" to channel ${channelId}`);

    try {
      // Use DiscordBotService if available
      if (this.discordBotService) {
        // Send critical/error events as embeds for better readability
        const isErrorEvent =
          context.eventType === 'feature_error' ||
          context.eventType === 'auto_mode_error' ||
          context.eventType === 'health_check_critical' ||
          context.eventType === 'feature_permanently_blocked' ||
          context.eventType === 'pr_ci_failure';

        let success: boolean;
        if (isErrorEvent) {
          success = await this.discordBotService.sendEmbed(channelId, {
            title: context.featureName
              ? `Feature Failed: ${context.featureName}`
              : `Event: ${context.eventType ?? 'error'}`,
            description: message.length > 4000 ? message.slice(0, 4000) + '...' : message,
            color: 0xed4245, // Discord red
            fields: [
              ...(context.featureId
                ? [{ name: 'Feature', value: context.featureId, inline: true }]
                : []),
              ...(context.projectName
                ? [{ name: 'Project', value: context.projectName, inline: true }]
                : []),
            ],
            footer: { text: 'protoLabs Studio' },
            timestamp: new Date().toISOString(),
          });
        } else {
          success = await this.discordBotService.sendToChannel(channelId, message);
        }

        if (success) {
          logger.info(`Discord hook "${hookName}" completed successfully`);
          return;
        } else {
          logger.warn(
            `Discord hook "${hookName}" failed: Could not send message to channel ${channelId}`
          );
          return;
        }
      }

      // Fallback: log warning if Discord bot service not available
      logger.warn(
        `Discord hook "${hookName}" skipped: Discord bot service not available. ` +
          `Ensure DISCORD_BOT_TOKEN is configured in environment variables.`
      );
    } catch (error) {
      logger.error(`Discord hook "${hookName}" failed:`, error);
      throw error;
    }
  }

  /**
   * Substitute {{variable}} placeholders in a string
   */
  private substituteVariables(template: string, context: HookContext): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      const value = context[variable as keyof HookContext];
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  /**
   * Extract project name from path
   */
  private extractProjectName(projectPath: string): string {
    const parts = projectPath.split(/[/\\]/);
    return parts[parts.length - 1] || projectPath;
  }

  // ============================================================================
  // Public methods to emit new events programmatically
  // ============================================================================

  /**
   * Emit a feature retry event
   */
  emitFeatureRetry(payload: FeatureRetryPayload): void {
    if (this.emitter) {
      this.emitter.emit('feature:retry', payload);
    }
  }

  /**
   * Emit a feature recovery event
   */
  emitFeatureRecovery(payload: FeatureRecoveryPayload): void {
    if (this.emitter) {
      this.emitter.emit('feature:recovery', payload);
    }
  }

  /**
   * Emit a skill created event
   */
  emitSkillCreated(payload: SkillCreatedPayload): void {
    if (this.emitter) {
      this.emitter.emit('skill:created', payload);
    }
  }

  /**
   * Emit a memory learning event
   */
  emitMemoryLearning(payload: MemoryLearningPayload): void {
    if (this.emitter) {
      this.emitter.emit('memory:learning', payload);
    }
  }

  /**
   * Emit an auto-mode health check event
   */
  emitHealthCheck(payload: HealthCheckPayload): void {
    if (this.emitter) {
      this.emitter.emit('auto-mode:health-check', payload);
    }
  }

  /**
   * Emit a project scaffolded event
   */
  emitProjectScaffolded(payload: ProjectScaffoldedPayload): void {
    if (this.emitter) {
      this.emitter.emit('project:scaffolded', payload);
    }
  }

  /**
   * Emit a project deleted event
   */
  emitProjectDeleted(payload: ProjectDeletedPayload): void {
    if (this.emitter) {
      this.emitter.emit('project:deleted', payload);
    }
  }
}

// Singleton instance
export const eventHookService = new EventHookService();
