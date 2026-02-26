/**
 * Integration Service - Manages Linear, Discord, and other external integrations
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

import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { LinearIntegrationConfig, ProjectIntegrations } from '@protolabs-ai/types';
import type { Feature } from '@protolabs-ai/types';
import type { CeremonyService } from './ceremony-service.js';
import { LinearMCPClient } from './linear-mcp-client.js';

const logger = createLogger('Integrations');

/**
 * Linear issue payload for MCP tool consumption
 */
export interface LinearIssuePayload {
  projectPath: string;
  featureId: string;
  feature: Feature;
  teamId?: string;
  projectId?: string;
  priority?: number;
  labelName?: string;
  action: 'create' | 'update' | 'comment';
}

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
  action: 'send_message' | 'create_thread' | 'add_reaction';
  content?: string;
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
 * Manages event-driven integrations with Linear, Discord, and other external services.
 * Emits integration-specific events that can be handled by MCP tools or webhooks.
 */
export class IntegrationService {
  private emitter: EventEmitter | null = null;
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private ceremonyService: CeremonyService | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize the service with dependencies
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    ceremonyService?: CeremonyService
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.ceremonyService = ceremonyService || null;

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
        case 'linear:issue:detected':
          this.handleLinearIssue(
            payload as {
              issueId: string;
              title: string;
              description?: string;
              state?: { name: string };
              createdAt: string;
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

    // Linear: Create issue when feature is created
    if (integrations.linear?.enabled && integrations.linear.syncOnFeatureCreate) {
      let teamId: string | undefined;
      try {
        teamId = await this.getLinearClient(projectPath).getTeamId();
      } catch {
        logger.warn('[Integration] No Linear teamId configured, skipping issue creation');
      }
      await this.emitLinearEvent({
        projectPath,
        featureId,
        feature,
        teamId,
        projectId: integrations.linear.projectId,
        priority: this.mapComplexityToPriority(feature.complexity, integrations.linear),
        labelName: integrations.linear.labelName,
        action: 'create',
      });
    }

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
        content: `🤖 Agent starting work on: ${feature.title}`,
      });
    }
  }

  /**
   * Handle feature:completed event
   */
  private async handleFeatureCompleted(payload: FeatureEventPayload): Promise<void> {
    const { projectPath, featureId } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) return;

    // Linear: Update issue status and add comment
    if (integrations.linear?.enabled) {
      let teamId: string | undefined;
      try {
        teamId = await this.getLinearClient(projectPath).getTeamId();
      } catch {
        logger.warn('[Integration] No Linear teamId configured, skipping status update');
      }
      if (integrations.linear.syncOnStatusChange) {
        await this.emitLinearEvent({
          projectPath,
          featureId,
          feature,
          teamId,
          projectId: integrations.linear.projectId,
          action: 'update',
        });
      }

      if (integrations.linear.commentOnCompletion) {
        await this.emitLinearEvent({
          projectPath,
          featureId,
          feature,
          teamId,
          projectId: integrations.linear.projectId,
          action: 'comment',
        });
      }
    }

    // Discord: Send completion notification
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
        content: `✅ Feature completed: **${feature.title}**`,
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

    // Discord: Send error notification with optional mention
    if (integrations.discord?.enabled && integrations.discord.notifyOnError) {
      const mention = integrations.discord.mentionOnError || '';
      await this.emitDiscordEvent({
        projectPath,
        featureId,
        feature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_message',
        content: `❌ Feature failed: **${feature.title}**\nError: ${error || 'Unknown error'}`,
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

    // Discord: Send auto-mode completion notification
    if (integrations.discord?.enabled && integrations.discord.notifyOnAutoModeComplete) {
      // Create a placeholder feature for the event
      const placeholderFeature = {
        id: 'auto-mode',
        title: 'Auto-Mode Completed',
      } as Feature;

      await this.emitDiscordEvent({
        projectPath: payload.projectPath,
        featureId: 'auto-mode',
        feature: placeholderFeature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_message',
        content: '🎉 Auto-mode completed all features in backlog!',
      });
    }
  }

  /**
   * Create a LinearMCPClient for the given project path.
   */
  private getLinearClient(projectPath: string): LinearMCPClient {
    return new LinearMCPClient(this.settingsService!, projectPath);
  }

  /**
   * Emit a Linear integration event
   */
  private async emitLinearEvent(payload: LinearIssuePayload): Promise<void> {
    if (!this.emitter) return;

    logger.info(
      `Emitting Linear ${payload.action} event for feature: ${payload.feature.title} (${payload.featureId})`
    );

    this.emitter.emit('integration:linear', payload);
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
   * Map ProtoMaker complexity to Linear priority
   */
  private mapComplexityToPriority(
    complexity: string | undefined,
    config: LinearIntegrationConfig
  ): number | undefined {
    if (!complexity || !config.priorityMapping) return undefined;

    const mapping = config.priorityMapping;
    switch (complexity) {
      case 'small':
        return mapping.small;
      case 'medium':
        return mapping.medium;
      case 'large':
        return mapping.large;
      case 'architectural':
        return mapping.architectural;
      default:
        return undefined;
    }
  }

  /**
   * Handle milestone:completed event
   */
  private async handleMilestoneCompleted(payload: {
    projectPath: string;
    projectTitle: string;
    projectSlug: string;
    milestoneTitle: string;
    milestoneNumber: number;
  }): Promise<void> {
    const { projectPath, projectTitle, milestoneTitle, milestoneNumber } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    // Discord: Send milestone completion notification
    if (integrations.discord?.enabled) {
      const placeholderFeature = {
        id: 'milestone-completed',
        title: `Milestone ${milestoneNumber}: ${milestoneTitle}`,
      } as Feature;

      await this.emitDiscordEvent({
        projectPath,
        featureId: 'milestone-completed',
        feature: placeholderFeature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_message',
        content: `🏁 **${projectTitle}** - Milestone ${milestoneNumber} completed: ${milestoneTitle}`,
      });
    }
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
        content: `🚀 **${projectTitle}** - Milestone ${milestoneNumber} started: ${milestoneTitle}`,
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
        content: `📋 **${projectTitle}** - Milestone ${milestoneNumber} planned: ${milestoneTitle} (${phaseCount} phases)`,
      });
    }
  }

  /**
   * Handle project:completed event
   */
  private async handleProjectCompleted(payload: {
    projectPath: string;
    projectTitle: string;
    projectSlug: string;
  }): Promise<void> {
    const { projectPath, projectTitle } = payload;

    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations) return;

    // Discord: Send project completion notification
    if (integrations.discord?.enabled) {
      const placeholderFeature = {
        id: 'project-completed',
        title: projectTitle,
      } as Feature;

      await this.emitDiscordEvent({
        projectPath,
        featureId: 'project-completed',
        feature: placeholderFeature,
        serverId: integrations.discord.serverId,
        channelId: integrations.discord.channelId,
        webhookId: integrations.discord.webhookId,
        webhookToken: integrations.discord.webhookToken,
        action: 'send_message',
        content: `🎉 **Project completed: ${projectTitle}** — All milestones done!`,
      });
    }
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
        content: `📝 CoS PRD submitted: **${title}** — entering pipeline for decomposition`,
      });
    }
  }

  /**
   * Handle authority:pm-review-approved and authority:pm-review-changes-requested events
   * This is the "Antagonistic Review Pipeline" - posts review summary to Discord and Linear
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
        const blockMessage = `${integrations.discord.mentionOnError} 🚨 **Review Blocked** — Feature "${feature.title}" requires changes before proceeding.\n\nReview notes: ${reviewNotes || 'See above'}`;
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

    // Linear: Create issue with PRD content + review verdict
    if (integrations.linear?.enabled) {
      let teamId: string | undefined;
      try {
        teamId = await this.getLinearClient(projectPath).getTeamId();
      } catch {
        logger.warn('[Integration] No Linear teamId configured, skipping issue creation');
      }
      await this.emitLinearEvent({
        projectPath,
        featureId,
        feature,
        teamId,
        projectId: integrations.linear.projectId,
        priority: this.mapComplexityToPriority(feature.complexity, integrations.linear),
        labelName: integrations.linear.labelName,
        action: 'create',
      });
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

    // Header with verdict emoji
    const emoji = verdict === 'approved' ? '✅' : '⚠️';
    const verdictText = verdict === 'approved' ? 'APPROVED' : 'CHANGES REQUESTED';
    lines.push(`${emoji} **Review ${verdictText}**: ${feature.title}`);
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
   * Manually trigger Linear issue creation for a feature
   */
  async triggerLinearSync(projectPath: string, featureId: string): Promise<void> {
    const integrations = await this.getProjectIntegrations(projectPath);
    if (!integrations?.linear?.enabled) {
      throw new Error('Linear integration is not enabled for this project');
    }

    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const teamId = await this.getLinearClient(projectPath).getTeamId();

    await this.emitLinearEvent({
      projectPath,
      featureId,
      feature,
      teamId,
      projectId: integrations.linear.projectId,
      priority: this.mapComplexityToPriority(feature.complexity, integrations.linear),
      labelName: integrations.linear.labelName,
      action: 'create',
    });
  }

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
   * Handle Linear issue creation events and detect signals
   */
  private async handleLinearIssue(payload: {
    issueId: string;
    title: string;
    description?: string;
    state?: { name: string };
    labels?: string[];
    projectId?: string;
    createdAt: string;
  }): Promise<void> {
    // All new Linear issues are treated as signals
    logger.info(`Signal detected from Linear issue: ${payload.title}`, {
      issueId: payload.issueId,
      labels: payload.labels,
      projectId: payload.projectId,
    });

    if (!this.emitter) return;

    this.emitter.emit('signal:received', {
      source: 'linear',
      content: `${payload.title}\n\n${payload.description || ''}`,
      author: {
        id: payload.issueId,
        name: 'Linear Issue',
      },
      channelContext: {
        issueId: payload.issueId,
        state: payload.state?.name,
        labels: payload.labels,
        projectId: payload.projectId,
      },
      timestamp: payload.createdAt,
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
   * Check Linear OAuth status
   */
  async checkLinearOAuthStatus(): Promise<boolean> {
    try {
      // Check for any token source: env vars (most common in Docker/staging)
      const token = process.env.LINEAR_API_KEY || process.env.LINEAR_API_TOKEN || '';
      if (!token) return false;

      // Validate token with a lightweight API call
      const auth = token.startsWith('lin_api_') ? token : `Bearer ${token}`;

      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
        },
        body: JSON.stringify({ query: '{ viewer { id } }' }),
        signal: AbortSignal.timeout(5000),
      });

      return res.ok;
    } catch (error) {
      logger.error('Failed to check Linear OAuth status:', error);
      return false;
    }
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
