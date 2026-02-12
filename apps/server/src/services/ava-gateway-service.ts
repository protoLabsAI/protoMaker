/**
 * Ava Gateway Service - Heartbeat monitoring with resilience
 *
 * Consolidates Phases 2-9 of the Ava Autonomous Operation project:
 * - Phase 2: Model-driven heartbeat (board health monitoring)
 * - Phase 4: Critical event subscription (real-time event routing)
 * - Phase 5: Health auto-remediation (health monitor integration)
 * - Phase 6: Timeout enforcement (agent operation timeouts)
 * - Phase 7: Gateway status API (health metrics + Discord startup)
 * - Phase 9: Circuit breaker (failure protection + exponential backoff)
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { Feature } from '@automaker/types';
import { FeatureLoader } from './feature-loader.js';
import { BeadsService } from './beads-service.js';
import type { DiscordBotService } from './discord-bot-service.js';
import { ClaudeProvider } from '../providers/claude-provider.js';
import type { SettingsService } from './settings-service.js';
import type { HealthMonitorService } from './health-monitor-service.js';
import { withTimeout, isTimeoutError } from '../lib/timeout-enforcer.js';
import { CircuitBreaker } from '../lib/circuit-breaker.js';

const logger = createLogger('AvaGatewayService');

/**
 * Heartbeat evaluation result from Ava
 */
export interface HeartbeatResult {
  status: 'ok' | 'alert';
  message?: string;
  alerts?: HeartbeatAlert[];
}

/**
 * Alert identified by Ava during heartbeat
 */
export interface HeartbeatAlert {
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  suggestedAction?: string;
}

/**
 * Gateway status for health monitoring (Phase 7)
 */
export interface GatewayStatus {
  initialized: boolean;
  listening: boolean;
  projectPath: string | null;
  infraChannelId: string | null;
  lastHeartbeat: string | null;
  lastHeartbeatStatus: 'ok' | 'alert' | null;
  totalHeartbeats: number;
  totalAlerts: number;
  circuitBreaker: {
    isOpen: boolean;
    failureCount: number;
  };
}

/**
 * Board summary for heartbeat evaluation
 */
interface BoardSummary {
  total: number;
  byStatus: Record<string, number>;
  blockedCount: number;
  inProgressCount: number;
  staleFeatures: Array<{
    id: string;
    title: string;
    status: string;
    daysSinceUpdate: number;
  }>;
  failedPRs: Array<{
    id: string;
    title: string;
    prNumber?: number;
    prUrl?: string;
  }>;
}

/**
 * Ava Gateway Service
 *
 * Runs periodic heartbeat checks on the Automaker board to identify
 * issues requiring immediate attention. Integrates with Discord and Beads
 * for notifications and task creation. Includes resilience features:
 * circuit breaker, timeout enforcement, and critical event routing.
 */
export class AvaGatewayService {
  private featureLoader: FeatureLoader;
  private beadsService: BeadsService;
  private discordBotService: DiscordBotService | null = null;
  private provider: ClaudeProvider | null = null;
  private events: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private healthMonitor: HealthMonitorService | null = null;
  private projectPath: string | null = null;
  private infraChannelId: string | null = null;

  // Phase 4: Critical event subscription
  private unsubscribe: (() => void) | null = null;
  private isListening = false;

  // Phase 7: Status tracking
  private initialized = false;
  private lastHeartbeat: string | null = null;
  private lastHeartbeatStatus: 'ok' | 'alert' | null = null;
  private totalHeartbeats = 0;
  private totalAlerts = 0;

  // Phase 9: Circuit breaker
  private circuitBreaker: CircuitBreaker;
  private backoffDelayMs = 0;

  // Rate limiting for real-time notifications
  private lastNotificationPost: Map<string, number> = new Map();
  private readonly NOTIFICATION_RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    featureLoader: FeatureLoader,
    beadsService: BeadsService,
    settingsService?: SettingsService,
    healthMonitor?: HealthMonitorService
  ) {
    this.featureLoader = featureLoader;
    this.beadsService = beadsService;
    this.settingsService = settingsService ?? null;
    this.healthMonitor = healthMonitor ?? null;

    // Initialize circuit breaker: 5 failures, 5 minute cooldown
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      cooldownMs: 300000,
      name: 'AvaGateway',
    });
  }

  /**
   * Set Discord bot service (called after both services are initialized)
   */
  setDiscordBot(discordBotService: DiscordBotService): void {
    this.discordBotService = discordBotService;
    logger.info('Discord bot service connected to Ava Gateway');
  }

  /**
   * Initialize the service with required configuration (Phase 7: async)
   */
  async initialize(
    events: EventEmitter,
    projectPath?: string,
    infraChannelId?: string
  ): Promise<void> {
    this.events = events;
    this.projectPath = projectPath ?? null;
    this.infraChannelId = infraChannelId ?? null;
    this.initialized = true;

    // Phase 5: Register project with health monitor for auto-remediation
    if (this.healthMonitor && this.projectPath) {
      this.healthMonitor.addProjectPath(this.projectPath);
      logger.info('Registered project with health monitor', { projectPath: this.projectPath });
    }

    logger.info('Ava Gateway Service initialized', { projectPath, infraChannelId });

    // Phase 7: Post startup message to Discord
    await this.postStartupMessage();
  }

  /**
   * Start listening to critical events (Phase 4)
   */
  start(): void {
    if (this.isListening) {
      logger.warn('Ava Gateway already listening to events');
      return;
    }

    if (!this.events) {
      logger.error('Cannot start Ava Gateway: EventEmitter not initialized');
      throw new Error('EventEmitter not initialized. Call initialize() first.');
    }

    this.unsubscribe = this.events.subscribe((type, payload) => {
      this.handleCriticalEvent(type, payload);
    });

    this.isListening = true;
    logger.info('Ava Gateway started - listening to critical events');
  }

  /**
   * Stop listening to critical events (Phase 4)
   */
  stop(): void {
    if (!this.isListening) {
      return;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.isListening = false;
    logger.info('Ava Gateway stopped');
  }

  /**
   * Check if the gateway is currently listening (Phase 4)
   */
  isActive(): boolean {
    return this.isListening;
  }

  /**
   * Set project path for monitoring
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;

    // Phase 5: Register with health monitor
    if (this.healthMonitor) {
      this.healthMonitor.addProjectPath(projectPath);
    }

    logger.info('Ava Gateway project path updated', { projectPath });
  }

  /**
   * Set Discord infra channel ID
   */
  setInfraChannelId(channelId: string): void {
    this.infraChannelId = channelId;
    logger.info('Ava Gateway Discord channel updated', { channelId });
  }

  /**
   * Get current gateway status (Phase 7)
   */
  getStatus(): GatewayStatus {
    return {
      initialized: this.initialized,
      listening: this.isListening,
      projectPath: this.projectPath,
      infraChannelId: this.infraChannelId,
      lastHeartbeat: this.lastHeartbeat,
      lastHeartbeatStatus: this.lastHeartbeatStatus,
      totalHeartbeats: this.totalHeartbeats,
      totalAlerts: this.totalAlerts,
      circuitBreaker: {
        isOpen: this.circuitBreaker.isCircuitOpen(),
        failureCount: this.circuitBreaker.getFailureCount(),
      },
    };
  }

  /**
   * Post startup message to Discord (Phase 7)
   * Retries up to 3 times with 3s delay to handle race condition where
   * Discord bot hasn't finished connecting when AvaGateway initializes.
   */
  private async postStartupMessage(): Promise<void> {
    if (!this.infraChannelId || !this.discordBotService) {
      return;
    }

    // Suppress startup messages in dev mode to avoid Discord spam
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Skipping Discord startup message (dev mode)');
      return;
    }

    const message =
      `**Ava Gateway Started**\n\n` +
      `**Status:** Online and monitoring\n` +
      `**Project:** ${this.projectPath || 'Not configured'}\n` +
      `**Timestamp:** ${new Date().toISOString()}`;

    const maxRetries = 3;
    const retryDelayMs = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const success = await this.discordBotService.sendToChannel(this.infraChannelId, message);
        if (success) {
          logger.info('Posted startup message to Discord #infra');
          return;
        }
        // Bot likely not ready yet — wait and retry
        if (attempt < maxRetries) {
          logger.debug(
            `Discord bot not ready, retrying startup message (${attempt}/${maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      } catch (error) {
        if (attempt < maxRetries) {
          logger.debug(`Discord startup message attempt ${attempt} failed, retrying...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        } else {
          logger.error('Failed to post startup message to Discord after retries', error);
        }
      }
    }

    logger.warn('Could not post startup message to Discord — bot may not be connected');
  }

  /**
   * Handle critical events from the event bus (Phase 4)
   */
  private handleCriticalEvent(type: string, payload: unknown): void {
    const data = payload as Record<string, unknown>;

    switch (type) {
      case 'feature:error':
        this.handleFeatureError(data);
        break;
      case 'auto-mode:error':
        this.handleAutoModeError(data);
        break;
      case 'authority:awaiting-approval':
        this.handleAwaitingApproval(data);
        break;
      case 'health:issue-detected':
        this.handleHealthIssue(data);
        break;
      case 'feature:blocked':
        this.handleFeatureBlocked(data);
        break;
      case 'pr:ci-failure':
        this.handlePRFailure(data);
        break;
      case 'notification:created':
        this.handleNotificationCreated(data);
        break;
      default:
        break;
    }
  }

  private handleFeatureError(payload: Record<string, unknown>): void {
    const alert: HeartbeatAlert = {
      severity: 'high',
      title: `Feature Error: ${payload.featureId}`,
      description: `Feature ${payload.featureId} encountered an error: ${payload.error}`,
      suggestedAction: 'Review error logs and retry or reassign feature',
    };
    void this.postToDiscord(alert);
    if (this.projectPath) void this.createBeadsTask(this.projectPath, alert);
  }

  private handleAutoModeError(payload: Record<string, unknown>): void {
    const alert: HeartbeatAlert = {
      severity: 'critical',
      title: 'Auto-mode Error',
      description: `Auto-mode encountered a critical error: ${payload.error}`,
      suggestedAction: 'Check auto-mode status and restart if needed',
    };
    void this.postToDiscord(alert);
    if (this.projectPath) void this.createBeadsTask(this.projectPath, alert);
  }

  private handleAwaitingApproval(payload: Record<string, unknown>): void {
    const alert: HeartbeatAlert = {
      severity: 'medium',
      title: 'Approval Required',
      description: `Proposal ${payload.proposalId} (${payload.proposalType}) is awaiting approval`,
      suggestedAction: 'Review and approve/reject the proposal',
    };
    void this.postToDiscord(alert);
  }

  private handleHealthIssue(payload: Record<string, unknown>): void {
    const severity = payload.severity as string;
    const alertSeverity: HeartbeatAlert['severity'] =
      severity === 'critical' ? 'critical' : severity === 'warning' ? 'high' : 'medium';

    const alert: HeartbeatAlert = {
      severity: alertSeverity,
      title: `Health Issue: ${payload.type}`,
      description: payload.message as string,
      suggestedAction: 'Review health dashboard and remediate if needed',
    };
    void this.postToDiscord(alert);
    if (this.projectPath && (alertSeverity === 'critical' || alertSeverity === 'high')) {
      void this.createBeadsTask(this.projectPath, alert);
    }
  }

  private handleFeatureBlocked(payload: Record<string, unknown>): void {
    const alert: HeartbeatAlert = {
      severity: 'high',
      title: `Feature Blocked: ${payload.featureId}`,
      description: `Feature ${payload.featureId} is blocked: ${payload.reason}`,
      suggestedAction: 'Unblock feature dependencies or resolve blockers',
    };
    void this.postToDiscord(alert);
    if (this.projectPath) void this.createBeadsTask(this.projectPath, alert);
  }

  private handlePRFailure(payload: Record<string, unknown>): void {
    const alert: HeartbeatAlert = {
      severity: 'high',
      title: `PR CI Failure: #${payload.prNumber}`,
      description: `PR #${payload.prNumber} (feature ${payload.featureId}) failed CI check: ${payload.checkName}`,
      suggestedAction: 'Review CI logs and fix failing tests or checks',
    };
    void this.postToDiscord(alert);
    if (this.projectPath) void this.createBeadsTask(this.projectPath, alert);
  }

  private handleNotificationCreated(payload: Record<string, unknown>): void {
    const notificationType = payload.type as string;
    const title = payload.title as string;
    const message = payload.message as string;

    // Only handle feature_waiting_approval and feature_error types
    if (notificationType !== 'feature_waiting_approval' && notificationType !== 'feature_error') {
      return;
    }

    // Check rate limiting
    if (!this.shouldPostNotification(notificationType)) {
      logger.debug('Rate limit: skipping notification post', { type: notificationType });
      return;
    }

    // Determine severity based on notification type
    const severity: HeartbeatAlert['severity'] =
      notificationType === 'feature_error' ? 'critical' : 'high';

    const alert: HeartbeatAlert = {
      severity,
      title: title || `Notification: ${notificationType}`,
      description: message || 'No description provided',
      suggestedAction:
        notificationType === 'feature_waiting_approval'
          ? 'Review and approve or reject the feature'
          : 'Review error logs and take corrective action',
    };

    void this.postToDiscordWithRateLimit(alert, notificationType);
  }

  /**
   * Check if notification should be posted based on rate limiting
   */
  private shouldPostNotification(notificationType: string): boolean {
    const now = Date.now();
    const lastPost = this.lastNotificationPost.get(notificationType);

    if (!lastPost) {
      return true;
    }

    return now - lastPost >= this.NOTIFICATION_RATE_LIMIT_MS;
  }

  /**
   * Post to Discord with rate limiting tracking
   */
  private async postToDiscordWithRateLimit(
    alert: HeartbeatAlert,
    notificationType: string
  ): Promise<void> {
    await this.postToDiscord(alert);
    this.lastNotificationPost.set(notificationType, Date.now());
    logger.info('Posted notification to Discord with rate limiting', {
      type: notificationType,
      severity: alert.severity,
    });
  }

  /**
   * Generate board summary for heartbeat evaluation
   */
  private async generateBoardSummary(projectPath: string): Promise<BoardSummary> {
    const features = await this.featureLoader.getAll(projectPath);

    const byStatus: Record<string, number> = {};
    let blockedCount = 0;
    let inProgressCount = 0;
    const staleFeatures: BoardSummary['staleFeatures'] = [];
    const failedPRs: BoardSummary['failedPRs'] = [];

    const now = Date.now();
    const STALE_THRESHOLD_DAYS = 7;

    for (const feature of features) {
      const status = feature.status || 'backlog';
      byStatus[status] = (byStatus[status] || 0) + 1;

      if (status === 'blocked') blockedCount++;
      if (status === 'in_progress') inProgressCount++;

      if (feature.startedAt) {
        const startedTime = new Date(feature.startedAt).getTime();
        const daysSinceUpdate = Math.floor((now - startedTime) / (1000 * 60 * 60 * 24));

        if (daysSinceUpdate >= STALE_THRESHOLD_DAYS && status !== 'done' && status !== 'backlog') {
          staleFeatures.push({
            id: feature.id,
            title: feature.title || 'Untitled',
            status,
            daysSinceUpdate,
          });
        }
      }

      if (status === 'review' && feature.prNumber) {
        failedPRs.push({
          id: feature.id,
          title: feature.title || 'Untitled',
          prNumber: feature.prNumber,
          prUrl: feature.prUrl,
        });
      }
    }

    return {
      total: features.length,
      byStatus,
      blockedCount,
      inProgressCount,
      staleFeatures: staleFeatures.slice(0, 10),
      failedPRs: failedPRs.slice(0, 10),
    };
  }

  /**
   * Parse Ava's response to extract heartbeat result
   */
  private parseHeartbeatResponse(response: string): HeartbeatResult {
    if (response.includes('HEARTBEAT_OK')) {
      return { status: 'ok', message: 'All systems nominal' };
    }

    const alerts: HeartbeatAlert[] = [];
    const alertRegex =
      /\*\*ALERT:\s*\[(low|medium|high|critical)\]\s*(.+?)\*\*\s*\n([\s\S]+?)(?=\n---|$)/gi;
    let match;

    while ((match = alertRegex.exec(response)) !== null) {
      const [, severity, title, description] = match;
      alerts.push({
        severity: severity as HeartbeatAlert['severity'],
        title: title.trim(),
        description: description.trim(),
      });
    }

    if (alerts.length > 0) {
      return { status: 'alert', alerts };
    }

    if (response.trim().length > 0 && !response.includes('No immediate attention')) {
      return {
        status: 'alert',
        message: response.trim(),
        alerts: [
          {
            severity: 'medium',
            title: 'Board attention needed',
            description: response.trim(),
          },
        ],
      };
    }

    return { status: 'ok', message: 'No immediate attention required' };
  }

  /**
   * Post alert to Discord #infra channel
   */
  private async postToDiscord(alert: HeartbeatAlert): Promise<void> {
    if (!this.infraChannelId || !this.discordBotService) {
      return;
    }

    const severityEmoji: Record<HeartbeatAlert['severity'], string> = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴',
    };

    const emoji = severityEmoji[alert.severity];
    const message = `${emoji} **Ava Heartbeat Alert**\n\n**${alert.title}**\n${alert.description}${alert.suggestedAction ? `\n\n**Suggested Action:** ${alert.suggestedAction}` : ''}`;

    try {
      const success = await this.discordBotService.sendToChannel(this.infraChannelId, message);
      if (success) {
        logger.info('Posted alert to Discord #infra', { title: alert.title });
      } else {
        logger.error('Failed to post alert to Discord');
      }
    } catch (error) {
      logger.error('Error posting to Discord', error);
    }
  }

  /**
   * Create Beads task for alert
   */
  private async createBeadsTask(projectPath: string, alert: HeartbeatAlert): Promise<void> {
    if (!projectPath) {
      return;
    }

    const beadsAvailable = await this.beadsService.checkCliAvailable();
    if (!beadsAvailable) {
      return;
    }

    const priorityMap: Record<HeartbeatAlert['severity'], number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    try {
      await this.beadsService.createTask(projectPath, {
        title: `[Ava Alert] ${alert.title}`,
        description: `${alert.description}${alert.suggestedAction ? `\n\nSuggested Action: ${alert.suggestedAction}` : ''}`,
        priority: priorityMap[alert.severity],
        issueType: 'task',
        labels: ['ava-alert', `severity-${alert.severity}`],
      });
    } catch (error) {
      logger.error('Error creating Beads task', error);
    }
  }

  /**
   * Calculate exponential backoff delay (Phase 9)
   */
  private calculateBackoffDelay(failureCount: number): number {
    if (failureCount < 3) return 0;
    return Math.pow(2, failureCount - 3) * 30000;
  }

  /**
   * Send emergency stop alert to Discord (Phase 9)
   */
  private async sendEmergencyStopAlert(): Promise<void> {
    if (!this.infraChannelId || !this.discordBotService) return;

    const message =
      `**CRITICAL: Ava Gateway Emergency Stop**\n\n` +
      `The circuit breaker has opened after 5 consecutive failures.\n\n` +
      `**Status:** Gateway stopped\n` +
      `**Action Required:** Investigate heartbeat failures\n` +
      `**Cooldown:** Will retry after 5 minutes`;

    try {
      const success = await this.discordBotService.sendToChannel(this.infraChannelId, message);
      if (success) {
        logger.info('Emergency stop alert sent to Discord #infra');
      } else {
        logger.error('Failed to send emergency stop alert to Discord');
      }
    } catch (error) {
      logger.error('Error sending emergency stop alert', error);
    }
  }

  /**
   * Run heartbeat check (with circuit breaker + timeout)
   */
  async runHeartbeat(): Promise<HeartbeatResult> {
    const startTime = Date.now();

    // Phase 9: Check circuit breaker
    if (this.circuitBreaker.isCircuitOpen()) {
      logger.warn('Circuit breaker is OPEN, skipping heartbeat');
      return {
        status: 'alert',
        message: 'Circuit breaker is open - gateway stopped after consecutive failures',
        alerts: [
          {
            severity: 'critical',
            title: 'Ava Gateway Circuit Breaker Open',
            description: 'Gateway in emergency stop. Will retry after cooldown.',
          },
        ],
      };
    }

    if (!this.projectPath) {
      return { status: 'ok', message: 'No project path configured' };
    }

    // Phase 9: Apply exponential backoff if needed
    if (this.circuitBreaker.shouldBackoff(3)) {
      this.backoffDelayMs = this.calculateBackoffDelay(this.circuitBreaker.getFailureCount());
      if (this.backoffDelayMs > 0) {
        logger.info(`Applying backoff delay: ${this.backoffDelayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, this.backoffDelayMs));
      }
    }

    if (!this.provider) {
      this.provider = new ClaudeProvider();
    }

    try {
      const summary = await this.generateBoardSummary(this.projectPath);
      const prompt = this.buildHeartbeatPrompt(summary);

      logger.info('Invoking Ava agent with board summary');
      const response = await this.invokeAva(prompt);
      const result = this.parseHeartbeatResponse(response);

      // Phase 9: Record success
      this.circuitBreaker.recordSuccess();
      this.backoffDelayMs = 0;

      // Phase 7: Update statistics
      this.totalHeartbeats++;
      this.lastHeartbeat = new Date().toISOString();
      this.lastHeartbeatStatus = result.status;

      if (result.status === 'alert' && result.alerts) {
        this.totalAlerts += result.alerts.length;
        const duration = Date.now() - startTime;
        logger.info(`Heartbeat identified ${result.alerts.length} alert(s) (${duration}ms)`);

        for (const alert of result.alerts) {
          await this.postToDiscord(alert);
          await this.createBeadsTask(this.projectPath, alert);
        }

        if (this.events) {
          (this.events as any).emit('ava-gateway:alerts', {
            alertCount: result.alerts.length,
            alerts: result.alerts,
          });
        }
      } else {
        const duration = Date.now() - startTime;
        logger.info(`Heartbeat OK (${duration}ms)`);

        if (this.events) {
          (this.events as any).emit('ava-gateway:heartbeat-ok', {
            message: result.message,
          });
        }
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Heartbeat check failed after ${duration}ms`, error);

      // Phase 9: Record failure
      const circuitOpened = this.circuitBreaker.recordFailure();
      if (circuitOpened) {
        await this.sendEmergencyStopAlert();
        if (this.events) {
          (this.events as any).emit('ava-gateway:emergency-stop', {
            failureCount: this.circuitBreaker.getFailureCount(),
            cooldownMs: 300000,
          });
        }
      }

      throw error;
    }
  }

  /**
   * Build heartbeat evaluation prompt
   */
  private buildHeartbeatPrompt(summary: BoardSummary): string {
    return `# Ava Heartbeat Check

You are Ava Loveland, Chief of Staff for Automaker. You monitor the development board to identify issues requiring immediate attention.

## Current Board State

**Total Features:** ${summary.total}

**By Status:**
${Object.entries(summary.byStatus)
  .map(([status, count]) => `- ${status}: ${count}`)
  .join('\n')}

**Blocked Features:** ${summary.blockedCount}
**In Progress:** ${summary.inProgressCount}

${summary.staleFeatures.length > 0 ? `**Stale Features (${summary.staleFeatures.length}):**\n${summary.staleFeatures.map((f) => `- ${f.title} (${f.status}, ${f.daysSinceUpdate} days old)`).join('\n')}` : ''}

${summary.failedPRs.length > 0 ? `**PRs in Review (${summary.failedPRs.length}):**\n${summary.failedPRs.map((f) => `- ${f.title}${f.prNumber ? ` (#${f.prNumber})` : ''}`).join('\n')}` : ''}

---

**Question:** What needs immediate attention?

**Instructions:**
- If everything looks good, respond with: HEARTBEAT_OK
- If there are issues, format each alert as:

**ALERT: [severity] Alert Title**
Description of the issue and why it needs attention.
---

**Severity levels:** low, medium, high, critical

Analyze the board state and respond with either HEARTBEAT_OK or one or more alerts.`;
  }

  /**
   * Invoke Ava agent with prompt (Phase 6: timeout enforcement)
   */
  private async invokeAva(prompt: string): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const result = await withTimeout(
      async (signal: AbortSignal) => {
        const generator = this.provider!.executeQuery({
          prompt,
          model: 'claude-sonnet-4-5-20250929',
          cwd: this.projectPath || process.cwd(),
        });

        let fullResponse = '';
        for await (const message of generator) {
          if (signal.aborted) {
            throw new Error('Operation aborted due to timeout');
          }

          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'text' && 'text' in block) {
                fullResponse += block.text;
              }
            }
          } else if (message.type === 'result' && message.result) {
            fullResponse += message.result;
          }
        }

        return fullResponse;
      },
      {
        operationId: `ava-heartbeat-${Date.now()}`,
        complexity: 'medium',
        events: this.events ?? undefined,
        metadata: {
          operation: 'ava-heartbeat',
          projectPath: this.projectPath,
        },
      }
    );

    return result;
  }
}

// Singleton instance
let avaGatewayServiceInstance: AvaGatewayService | null = null;

/**
 * Get or create the singleton Ava Gateway service instance
 */
export function getAvaGatewayService(
  featureLoader: FeatureLoader,
  beadsService: BeadsService,
  settingsService?: SettingsService,
  healthMonitor?: HealthMonitorService
): AvaGatewayService {
  if (!avaGatewayServiceInstance) {
    avaGatewayServiceInstance = new AvaGatewayService(
      featureLoader,
      beadsService,
      settingsService,
      healthMonitor
    );
  }
  return avaGatewayServiceInstance;
}

/**
 * Reset the singleton instance (for testing only)
 */
export function _resetAvaGatewayServiceForTesting(): void {
  avaGatewayServiceInstance = null;
}
