/**
 * Integration Service - Manages Discord and other external integrations
 *
 * Listens to ProtoMaker events and emits integration-specific events with
 * formatted payloads that can be consumed by MCP tools or external processes.
 *
 * This service acts as an event-driven bridge between ProtoMaker and external
 * tools, preparing data and emitting structured events without directly calling
 * MCP tools (which run in the CLI environment, not the server).
 *
 * Flow:
 * 1. ProtoMaker event occurs (feature:created, feature:completed, etc.)
 * 2. IntegrationService checks if integrations are enabled for the project
 * 3. Service emits integration-specific events with formatted data
 * 4. External processes (EventHooks, MCP subscriptions) handle the events
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectIntegrations } from '@protolabsai/types';
import type { Feature } from '@protolabsai/types';

const logger = createLogger('Integrations');

/**
 * Discord message payload for MCP tool consumption
 */
export interface DiscordMessagePayload {
  projectPath: string;
  featureId: string;
  feature: Feature;
  serverId?: string;
  channelId?: string;
  webhookId?: string;
  webhookToken?: string;
  action: 'send_message' | 'send_embed' | 'create_thread' | 'add_reaction';
  content?: string;
  embed?: {
    title: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  };
  mention?: string;
}

/**
 * Feature event payload from the event system
 */
interface FeatureEventPayload {
  featureId: string;
  featureName?: string;
  projectPath: string;
  error?: string;
}

/**
 * Integration Service
 *
 * Manages event-driven integrations with Discord and other external services.
 * Emits integration-specific events that can be handled by MCP tools or webhooks.
 */
export class IntegrationService {
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize the service with dependencies
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;

    // Subscribe to ProtoMaker events
    this.unsubscribe = emitter.subscribe((type, payload) => {
      switch (type) {
        case 'feature:created':
          this.handleFeatureCreated(payload as FeatureEventPayload);
          break;
        case 'feature:completed':
          this.handleFeatureCompleted(payload as FeatureEventPayload);
          break;
        case 'feature:error':
          this.handleFeatureError(payload as FeatureEventPayload);
          break;
        case 'auto-mode:event':
          // Handle auto-mode completion events
          this.handleAutoModeEvent(payload as { type?: string; projectPath?: string });
          break;
        case 'milestone:completed':
          this.handleMilestoneCompleted(
            payload as {
              projectPath: string;
              projectTitle: string;
              projectSlug: string;
              milestoneTitle: string;
              milestoneNumber: number;
            }
          );
          break;
        case 'milestone:started':
          this.handleMilestoneStarted(
            payload as {
              projectPath: string;
              projectTitle: string;
              projectSlug: string;
              milestoneTitle: string;
              milestoneNumber: number;
            }
          );
          break;
        case 'milestone:planned':
          this.handleMilestonePlanned(
            payload as {
              projectPath: string;
              projectTitle: string;
              projectSlug: string;
              milestoneTitle: string;
              milestoneNumber: number;
              phaseCount: number;
            }
          );
          break;
        case 'project:completed':
          this.handleProjectCompleted(
            payload as {
              projectPath: string;
              projectTitle: string;
              projectSlug: string;
            }
          );
          break;
        case 'cos:prd-submitted':
          this.handleCosPrdSubmitted(
            payload as {
              projectPath: string;
              title: string;
            }
          );
          break;
        case 'authority:pm-review-approved':
        case 'authority:pm-review-changes-requested':
          this.handleReviewCompleted(
            payload as {
              projectPath: string;
              featureId: string;
              agentId?: string;
              complexity?: string;
              milestones?: Array<{ title: string; description: string }>;
              reviewNotes?: string;
              verdict?: 'approved' | 'changes_requested';
            },
            type
          );
          break;
        case 'discord:message:detected':
          this.handleDiscordMessage(
            payload as {
              channelId: string;
              channelName?: string;
              userId: string;
              username: string;
              content: string;
              timestamp: string;
            }
          );
          break;
        case 'discord:reaction:signal':
          this.handleDiscordReactionSignal(
            payload as {
              abilityId: string;
              emoji: string;
              messageContent: string;
              channelId: string;
              userId: string;
              username: string;
              messageId: string;
              intent: string;
              autoFeature: boolean;
            }
          );
          break;
        case 'webhook:github:issue':
          this.handleGitHubIssue(
            payload as {
              action: string;
              issueNumber: number;
              title: string;
              body: string;
              author: string;
              createdAt: string;
              repository: string;
            }
          );
          break;
      }
    });

    logger.info('Integration service initialized');
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
    this.featureLoader = null;
  }

  /**
   * Handle feature:created event
   */
  private async handleFeatureCreated(payload: FeatureEventPayload): Promise<void> {
    const { projectPath, featureId } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) return;

    // Discord: Create thread when agent starts
    if (integrations.discord?.enabled && integrations.discord.createThreadsForAgents) {
      await this.emitDiscordEvent({
        projectPath,
        featureId,
        feature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'create_thread',
        content: `Agent starting work on: ${feature.title}`,
      });
    }
  }

  /**
   * Handle feature:completed event
   *
   * Skips individual feature notifications for features that belong to a project
   * (have a projectSlug). Those are covered by milestone:completed and
   * project:completed events instead, reducing Discord noise.
   */
  private async handleFeatureCompleted(payload: FeatureEventPayload): Promise<void> {
    const { projectPath, featureId } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) return;

    // Skip per-feature notifications for project-scoped features.
    // Milestone and project completion events handle the roll-up.
    if (feature.projectSlug) return;

    // Discord: Send completion notification (standalone features only)
    if (integrations.discord?.enabled && integrations.discord.notifyOnCompletion) {
      await this.emitDiscordEvent({
        projectPath,
        featureId,
        feature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_message',
        content: `Feature completed: **${feature.title}**`,
      });
    }
  }

  /**
   * Handle feature:error event
   */
  private async handleFeatureError(payload: FeatureEventPayload): Promise<void> {
    const { projectPath, featureId, error } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) return;

    // Discord: Send error notification as embed with optional mention
    if (integrations.discord?.enabled && integrations.discord.notifyOnError) {
      const mention = integrations.discord.mentionOnError || '';
      const errorText = error || 'Unknown error';
      // Truncate error to Discord embed description limit (4096 chars)
      const description = errorText.length > 4000 ? errorText.slice(0, 4000) + '...' : errorText;
      await this.emitDiscordEvent({
        projectPath,
        featureId,
        feature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_embed',
        embed: {
          title: `Feature Failed: ${feature.title}`,
          description,
          color: 0xed4245, // Discord red
          fields: [
            { name: 'Feature', value: feature.id, inline: true },
            { name: 'Status', value: 'blocked', inline: true },
          ],
          footer: { text: 'protoLabs Studio' },
          timestamp: new Date().toISOString(),
        },
        mention,
      });
    }
  }

  /**
   * Handle auto-mode:event for completion notifications
   */
  private async handleAutoModeEvent(payload: {
    type?: string;
    projectPath?: string;
  }): Promise<void> {
    if (payload.type !== 'auto_mode_idle' || !payload.projectPath) return;

    const integrations = await this.getProjectIntegrations(payload.projectPath);
    if (!integrations) return;

    // Discord auto-mode completion notification disabled — fires false positives
    // when features exist but are dependency-blocked (auto_mode_idle != backlog empty)
  }

  /**
   * Emit a Discord integration event
   */
  private async emitDiscordEvent(payload: DiscordMessagePayload): Promise<void> {
    if (!this.emitter) return;

    logger.info(
      `Emitting Discord ${payload.action} event for feature: ${payload.feature.title} (${payload.featureId})`
    );

    this.emitter.emit('integration:discord', payload);
  }

  /**
   * Get project integrations configuration
   */
  private async getProjectIntegrations(projectPath: string): Promise<ProjectIntegrations | null> {
    if (!this.settingsService) return null;

    try {
      const projectSettings = await this.settingsService.getProjectSettings(projectPath);
      return projectSettings.integrations || null;
    } catch (error) {
      logger.error(`Failed to load project settings for ${projectPath}:`, error);
      return null;
    }
  }

  /**
   * Load feature from storage
   */
  private async loadFeature(projectPath: string, featureId: string): Promise<Feature | null> {
    if (!this.featureLoader) return null;

    try {
      return await this.featureLoader.get(projectPath, featureId);
    } catch (error) {
      logger.warn(`Failed to load feature ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Handle milestone:completed event
   *
   * Suppressed — ChangelogService posts a rich embed with feature breakdown
   * for the same event, which is strictly better than a plain-text message.
   */
  private async handleMilestoneCompleted(_payload: {
    projectPath: string;
    projectTitle: string;
    projectSlug: string;
    milestoneTitle: string;
    milestoneNumber: number;
  }): Promise<void> {
    // No-op: ChangelogService handles milestone completion with rich embeds.
  }

  /**
   * Handle milestone:started event
   */
  private async handleMilestoneStarted(payload: {
    projectPath: string;
    projectTitle: string;
    projectSlug: string;
    milestoneTitle: string;
    milestoneNumber: number;
  }): Promise<void> {
    const { projectPath, projectTitle, milestoneTitle, milestoneNumber } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    // Discord: Send milestone started notification
    if (integrations.discord?.enabled) {
      const placeholderFeature = {
        id: 'milestone-started',
        title: `Milestone ${milestoneNumber}: ${milestoneTitle}`,
      } as Feature;

      await this.emitDiscordEvent({
        projectPath,
        featureId: 'milestone-started',
        feature: placeholderFeature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_message',
        content: `**${projectTitle}** - Milestone ${milestoneNumber} started: ${milestoneTitle}`,
      });
    }
  }

  /**
   * Handle milestone:planned event
   */
  private async handleMilestonePlanned(payload: {
    projectPath: string;
    projectTitle: string;
    projectSlug: string;
    milestoneTitle: string;
    milestoneNumber: number;
    phaseCount: number;
  }): Promise<void> {
    const { projectPath, projectTitle, milestoneTitle, milestoneNumber, phaseCount } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    // Discord: Send milestone planned notification
    if (integrations.discord?.enabled) {
      const placeholderFeature = {
        id: 'milestone-planned',
        title: `Milestone ${milestoneNumber}: ${milestoneTitle}`,
      } as Feature;

      await this.emitDiscordEvent({
        projectPath,
        featureId: 'milestone-planned',
        feature: placeholderFeature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_message',
        content: `**${projectTitle}** - Milestone ${milestoneNumber} planned: ${milestoneTitle} (${phaseCount} phases)`,
      });
    }
  }

  /**
   * Handle project:completed event
   *
   * Suppressed — ChangelogService posts a rich embed with full feature
   * breakdown for the same event.
   */
  private async handleProjectCompleted(_payload: {
    projectPath: string;
    projectTitle: string;
    projectSlug: string;
  }): Promise<void> {
    // No-op: ChangelogService handles project completion with rich embeds.
  }

  /**
   * Handle cos:prd-submitted event
   */
  private async handleCosPrdSubmitted(payload: {
    projectPath: string;
    title: string;
  }): Promise<void> {
    const { projectPath, title } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    // Discord: Send CoS PRD submitted notification
    if (integrations.discord?.enabled) {
      const placeholderFeature = {
        id: 'cos-prd-submitted',
        title,
      } as Feature;

      await this.emitDiscordEvent({
        projectPath,
        featureId: 'cos-prd-submitted',
        feature: placeholderFeature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_message',
        content: `CoS PRD submitted: **${title}** -- entering pipeline for decomposition`,
      });
    }
  }

  /**
   * Handle authority:pm-review-approved and authority:pm-review-changes-requested events
   * This is the "Antagonistic Review Pipeline" - posts review summary to Discord
   */
  private async handleReviewCompleted(
    payload: {
      projectPath: string;
      featureId: string;
      agentId?: string;
      complexity?: string;
      milestones?: Array<{ title: string; description: string }>;
      reviewNotes?: string;
      verdict?: 'approved' | 'changes_requested';
    },
    eventType: string
  ): Promise<void> {
    const { projectPath, featureId, reviewNotes } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) return;

    // Determine verdict from event type if not explicitly provided
    const verdict =
      payload.verdict ||
      (eventType === 'authority:pm-review-approved' ? 'approved' : 'changes_requested');

    // Build review summary for Discord
    const reviewSummary = this.buildReviewSummary(feature, verdict, reviewNotes);

    // Discord: Post review summary within 1 minute (immediate)
    if (integrations.discord?.enabled) {
      await this.emitDiscordEvent({
        projectPath,
        featureId,
        feature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_message',
        content: reviewSummary,
      });

      // Flag unresolved blocks for Josh if changes requested
      if (verdict === 'changes_requested' && integrations.discord.mentionOnError) {
        const blockMessage = `${integrations.discord.mentionOnError} **Review Blocked** -- Feature "${feature.title}" requires changes before proceeding.\n\nReview notes: ${reviewNotes || 'See above'}`;
        await this.emitDiscordEvent({
          projectPath,
          featureId,
          feature,
          serverId: integrations.discord.serverId,
          channelId: integrations.discord.channelId,
          webhookId: integrations.discord.webhookId,
          webhookToken: integrations.discord.webhookToken,
          action: 'send_message',
          content: blockMessage,
        });
      }
    }
  }

  /**
   * Build review summary message for Discord
   */
  private buildReviewSummary(
    feature: Feature,
    verdict: 'approved' | 'changes_requested',
    reviewNotes?: string
  ): string {
    const lines: string[] = [];

    // Header with verdict
    const verdictText = verdict === 'approved' ? 'APPROVED' : 'CHANGES REQUESTED';
    lines.push(`**Review ${verdictText}**: ${feature.title}`);
    lines.push('');

    // PRD content summary
    if (feature.description) {
      const descPreview =
        feature.description.length > 200
          ? feature.description.slice(0, 200) + '...'
          : feature.description;
      lines.push(`**PRD Summary:** ${descPreview}`);
      lines.push('');
    }

    // Complexity
    if (feature.complexity) {
      lines.push(`**Complexity:** ${feature.complexity}`);
    }

    // Review notes/verdict details
    if (reviewNotes) {
      lines.push('');
      lines.push(`**Review Notes:**`);
      lines.push(reviewNotes);
    }

    // Next steps
    lines.push('');
    if (verdict === 'approved') {
      lines.push(`**Next Steps:** ProjM will decompose into milestones and features`);
    } else {
      lines.push(`**Next Steps:** Address review feedback and resubmit`);
    }

    return lines.join('\n');
  }

  // ============================================================================
  // Public API for manual integration triggers
  // ============================================================================

  /**
   * Manually trigger Discord notification for a feature
   */
  async triggerDiscordNotification(
    projectPath: string,
    featureId: string,
    message: string
  ): Promise<void> {
    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations?.discord?.enabled) {
      throw new Error('Discord integration is not enabled for this project');
    }

    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    await this.emitDiscordEvent({
      projectPath,
      featureId,
      feature,
      serverId: integrations.discord.serverId,
      channelId: integrations.discord.channelId,
      webhookId: integrations.discord.webhookId,
      webhookToken: integrations.discord.webhookToken,
      action: 'send_message',
      content: message,
    });
  }

  // ============================================================================
  // Signal Intake - Simplified keyword detection for Ava triage
  // ============================================================================

  /**
   * Keywords that indicate a message is a signal (idea or request)
   */
  private readonly SIGNAL_KEYWORDS = [
    'we need',
    'let us build',
    'lets build',
    "let's build",
    'feature request',
    'idea:',
    'what if',
    'could we',
    'can we build',
    'we should',
    'it would be cool',
    'request:',
    'proposal:',
  ];

  /**
   * Detect if a message contains signal keywords
   */
  private detectSignal(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return this.SIGNAL_KEYWORDS.some((keyword) => lowerContent.includes(keyword));
  }

  /**
   * Handle Discord message events and detect signals
   */
  private async handleDiscordMessage(payload: {
    channelId: string;
    channelName?: string;
    userId: string;
    username: string;
    content: string;
    timestamp: string;
  }): Promise<void> {
    // Simple keyword detection - not a classification engine
    if (!this.detectSignal(payload.content)) {
      // Casual conversation, let it pass through
      return;
    }

    // Signal detected - route to Ava triage
    logger.info(`Signal detected in Discord message from ${payload.username}`, {
      channelId: payload.channelId,
      channelName: payload.channelName,
      contentPreview: payload.content.slice(0, 100),
    });

    if (!this.emitter) return;

    this.emitter.emit('signal:received', {
      source: 'discord',
      content: payload.content,
      author: {
        id: payload.userId,
        name: payload.username,
      },
      channelContext: {
        channelId: payload.channelId,
        channelName: payload.channelName,
      },
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle discord:reaction:signal events from reaction abilities.
   * Routes the reacted message content as a signal into the intake pipeline.
   * If autoFeature is true, autoApprove is set so the signal bypasses PM classification.
   */
  private handleDiscordReactionSignal(payload: {
    abilityId: string;
    emoji: string;
    messageContent: string;
    channelId: string;
    userId: string;
    username: string;
    messageId: string;
    intent: string;
    autoFeature: boolean;
  }): void {
    logger.info(
      `Routing reaction signal: ${payload.emoji} by ${payload.username} in channel ${payload.channelId}`,
      {
        abilityId: payload.abilityId,
        messageId: payload.messageId,
        autoFeature: payload.autoFeature,
      }
    );

    if (!this.emitter) return;

    // bug_report intent triggers the bug triage workflow directly
    if (payload.intent === 'bug_report') {
      this.emitter.emit('bug:reaction-triggered', {
        messageContent: payload.messageContent,
        channelId: payload.channelId,
        messageId: payload.messageId,
        userId: payload.userId,
        username: payload.username,
      });
    }

    this.emitter.emit('signal:received', {
      source: 'discord',
      content: payload.messageContent,
      author: {
        id: payload.userId,
        name: payload.username,
      },
      channelContext: {
        channelId: payload.channelId,
        messageId: payload.messageId,
        emoji: payload.emoji,
        abilityId: payload.abilityId,
        intent: payload.intent,
        autoApprove: payload.autoFeature,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle GitHub issue creation events and detect signals
   */
  private async handleGitHubIssue(payload: {
    action: string;
    issueNumber: number;
    title: string;
    body: string;
    author: string;
    createdAt: string;
    repository: string;
  }): Promise<void> {
    // Only handle newly opened issues
    if (payload.action !== 'opened') {
      return;
    }

    // All new GitHub issues are treated as signals
    logger.info(`Signal detected from GitHub issue #${payload.issueNumber}: ${payload.title}`, {
      repository: payload.repository,
      author: payload.author,
    });

    if (!this.emitter) return;

    this.emitter.emit('signal:received', {
      source: 'github',
      content: `${payload.title}\n\n${payload.body}`,
      author: {
        id: payload.author,
        name: payload.author,
      },
      channelContext: {
        issueNumber: payload.issueNumber,
        repository: payload.repository,
      },
      timestamp: payload.createdAt,
    });
  }

  /**
   * Check Discord bot status
   */
  async checkDiscordBotStatus(): Promise<boolean> {
    // Check if Discord bot is connected
    // This is a placeholder - actual implementation would check Discord client status
    return false;
  }

  /**
   * Check GitHub auth status via gh CLI
   */
  async checkGitHubAuthStatus(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');
      // Check if gh CLI is authenticated
      execSync('gh auth status', { stdio: 'pipe' });
      return true;
    } catch (error) {
      logger.debug('GitHub CLI not authenticated:', error);
      return false;
    }
  }
}

// Singleton instance
export const integrationService = new IntegrationService();
