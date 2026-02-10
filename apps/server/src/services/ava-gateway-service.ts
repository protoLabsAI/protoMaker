/**
 * Ava Gateway Service - Heartbeat monitoring for board health
 *
 * Provides a 30-minute heartbeat check that:
 * - Invokes Ava agent with board summary
 * - Asks "What needs immediate attention?"
 * - Parses response for HEARTBEAT_OK or alert message
 * - Posts alerts to Discord #infra channel
 * - Creates Beads tasks for actionable alerts
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { Feature } from '@automaker/types';
import { FeatureLoader } from './feature-loader.js';
import { BeadsService } from './beads-service.js';
import { DiscordService } from './discord-service.js';
import { ClaudeProvider } from '../providers/claude-provider.js';
import type { SettingsService } from './settings-service.js';

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
 * for notifications and task creation.
 */
export class AvaGatewayService {
  private featureLoader: FeatureLoader;
  private beadsService: BeadsService;
  private discordService: DiscordService;
  private provider: ClaudeProvider | null = null;
  private events: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private projectPath: string | null = null;
  private infraChannelId: string | null = null;

  constructor(
    featureLoader: FeatureLoader,
    beadsService: BeadsService,
    discordService: DiscordService,
    settingsService?: SettingsService
  ) {
    this.featureLoader = featureLoader;
    this.beadsService = beadsService;
    this.discordService = discordService;
    this.settingsService = settingsService ?? null;
  }

  /**
   * Initialize the service with required configuration
   */
  initialize(events: EventEmitter, projectPath?: string, infraChannelId?: string): void {
    this.events = events;
    this.projectPath = projectPath ?? null;
    this.infraChannelId = infraChannelId ?? null;
    logger.info('Ava Gateway Service initialized', { projectPath, infraChannelId });
  }

  /**
   * Set project path for monitoring
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
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
   * Generate board summary for heartbeat evaluation
   */
  private async generateBoardSummary(projectPath: string): Promise<BoardSummary> {
    const features = await this.featureLoader.getAll(projectPath);

    // Count by status
    const byStatus: Record<string, number> = {};
    let blockedCount = 0;
    let inProgressCount = 0;
    const staleFeatures: BoardSummary['staleFeatures'] = [];
    const failedPRs: BoardSummary['failedPRs'] = [];

    const now = Date.now();
    const STALE_THRESHOLD_DAYS = 7;

    for (const feature of features) {
      // Count by status
      const status = feature.status || 'backlog';
      byStatus[status] = (byStatus[status] || 0) + 1;

      // Track blocked and in-progress
      if (status === 'blocked') blockedCount++;
      if (status === 'in_progress') inProgressCount++;

      // Find stale features (not updated in 7+ days)
      // Use startedAt as proxy for last update time
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

      // Track failed PRs (in review but checks failed or has open feedback)
      if (status === 'review' && feature.prNumber) {
        // This is a simplified check - in production you'd check GitHub PR status
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
      staleFeatures: staleFeatures.slice(0, 10), // Limit to 10 most stale
      failedPRs: failedPRs.slice(0, 10), // Limit to 10
    };
  }

  /**
   * Parse Ava's response to extract heartbeat result
   */
  private parseHeartbeatResponse(response: string): HeartbeatResult {
    // Check for explicit HEARTBEAT_OK marker
    if (response.includes('HEARTBEAT_OK')) {
      return {
        status: 'ok',
        message: 'All systems nominal',
      };
    }

    // Extract alerts from response
    // Format expected: **ALERT: [severity] title**\ndescription\n---
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

    // If we found alerts, return them
    if (alerts.length > 0) {
      return {
        status: 'alert',
        alerts,
      };
    }

    // If response doesn't contain HEARTBEAT_OK but also no explicit alerts,
    // treat the entire response as an alert message
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

    // Default: everything is OK
    return {
      status: 'ok',
      message: 'No immediate attention required',
    };
  }

  /**
   * Post alert to Discord #infra channel
   */
  private async postToDiscord(alert: HeartbeatAlert): Promise<void> {
    if (!this.infraChannelId) {
      logger.warn('Discord infra channel not configured, skipping Discord notification');
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
      const result = await this.discordService.sendMessage({
        channelId: this.infraChannelId,
        message,
      });

      if (result.success) {
        logger.info('Posted alert to Discord #infra', { title: alert.title });
      } else {
        logger.error('Failed to post alert to Discord', { error: result.error });
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
      logger.warn('Project path not set, skipping Beads task creation');
      return;
    }

    // Check if Beads CLI is available
    const beadsAvailable = await this.beadsService.checkCliAvailable();
    if (!beadsAvailable) {
      logger.warn('Beads CLI not available, skipping task creation');
      return;
    }

    const priorityMap: Record<HeartbeatAlert['severity'], number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    try {
      const result = await this.beadsService.createTask(projectPath, {
        title: `[Ava Alert] ${alert.title}`,
        description: `${alert.description}${alert.suggestedAction ? `\n\nSuggested Action: ${alert.suggestedAction}` : ''}`,
        priority: priorityMap[alert.severity],
        issueType: 'task',
        labels: ['ava-alert', `severity-${alert.severity}`],
      });

      if (result.success) {
        logger.info('Created Beads task for alert', {
          title: alert.title,
          taskId: result.data?.id,
        });
      } else {
        logger.error('Failed to create Beads task', { error: result.error });
      }
    } catch (error) {
      logger.error('Error creating Beads task', error);
    }
  }

  /**
   * Run heartbeat check
   */
  async runHeartbeat(): Promise<HeartbeatResult> {
    logger.info('Running Ava heartbeat check');

    if (!this.projectPath) {
      logger.warn('Ava Gateway: No project path configured, skipping heartbeat');
      return {
        status: 'ok',
        message: 'No project path configured',
      };
    }

    // Lazily create provider if not set
    if (!this.provider) {
      this.provider = new ClaudeProvider();
    }

    try {
      // Generate board summary
      const summary = await this.generateBoardSummary(this.projectPath);

      // Build prompt with board summary
      const prompt = this.buildHeartbeatPrompt(summary);

      // Invoke Ava agent
      logger.debug('Invoking Ava agent with board summary');
      const response = await this.invokeAva(prompt);

      // Parse response
      const result = this.parseHeartbeatResponse(response);

      // Handle alerts
      if (result.status === 'alert' && result.alerts) {
        logger.info(`Heartbeat identified ${result.alerts.length} alerts`);

        // Process each alert
        for (const alert of result.alerts) {
          // Post to Discord
          await this.postToDiscord(alert);

          // Create Beads task
          await this.createBeadsTask(this.projectPath, alert);
        }

        // Emit event (cast to any since ava-gateway events aren't defined in EventType yet)
        if (this.events) {
          (this.events as any).emit('ava-gateway:alerts', {
            alertCount: result.alerts.length,
            alerts: result.alerts,
          });
        }
      } else {
        logger.info('Heartbeat OK - no issues requiring attention');

        // Emit event (cast to any since ava-gateway events aren't defined in EventType yet)
        if (this.events) {
          (this.events as any).emit('ava-gateway:heartbeat-ok', {
            message: result.message,
          });
        }
      }

      return result;
    } catch (error) {
      logger.error('Heartbeat check failed', error);
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
   * Invoke Ava agent with prompt
   */
  private async invokeAva(prompt: string): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    // Use the provider's executeQuery generator to get Ava's response
    const generator = this.provider.executeQuery({
      prompt,
      model: 'claude-sonnet-4-5-20250929', // Use Sonnet for cost efficiency
      cwd: this.projectPath || process.cwd(),
    });

    // Collect all messages from the generator
    let fullResponse = '';
    for await (const message of generator) {
      if (message.type === 'assistant' && message.message?.content) {
        // Extract text from content blocks
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
  discordService: DiscordService,
  settingsService?: SettingsService
): AvaGatewayService {
  if (!avaGatewayServiceInstance) {
    avaGatewayServiceInstance = new AvaGatewayService(
      featureLoader,
      beadsService,
      discordService,
      settingsService
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
