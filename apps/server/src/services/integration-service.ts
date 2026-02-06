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

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { LinearClientService } from './linear-client.js';
import type {
  LinearIntegrationConfig,
  DiscordIntegrationConfig,
  ProjectIntegrations,
} from '@automaker/types';
import type { Feature } from '@automaker/types';

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
  private linearClient: LinearClientService | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize the service with dependencies
   */
  initialize(
    emitter: EventEmitter,
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    linearClient?: LinearClientService
  ): void {
    this.emitter = emitter;
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.linearClient = linearClient || null;

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
      }
    });

    logger.info('Integration service initialized');
  }

  /**
   * Set the Linear client after initialization
   * This allows the server to inject the Linear client after it's been initialized
   */
  setLinearClient(linearClient: LinearClientService): void {
    this.linearClient = linearClient;
    logger.info('Linear client set for integration service');
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
    this.linearClient = null;
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
      await this.emitLinearEvent({
        projectPath,
        featureId,
        feature,
        teamId: integrations.linear.teamId,
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
      if (integrations.linear.syncOnStatusChange) {
        await this.emitLinearEvent({
          projectPath,
          featureId,
          feature,
          teamId: integrations.linear.teamId,
          projectId: integrations.linear.projectId,
          action: 'update',
        });
      }

      if (integrations.linear.commentOnCompletion) {
        await this.emitLinearEvent({
          projectPath,
          featureId,
          feature,
          teamId: integrations.linear.teamId,
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
   * Emit a Linear integration event
   * If LinearClient is available and connected, directly create/update issues
   * Otherwise, emit events for external handlers (e.g., MCP tools via EventHooks)
   */
  private async emitLinearEvent(payload: LinearIssuePayload): Promise<void> {
    if (!this.emitter) return;

    logger.info(
      `Processing Linear ${payload.action} event for feature: ${payload.feature.title} (${payload.featureId})`
    );

    // If LinearClient is available and connected, use it directly
    if (this.linearClient?.isConnected() && payload.teamId) {
      try {
        await this.executeLinearAction(payload);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Direct Linear API call failed, falling back to event emission: ${message}`);
        // Fall through to emit event as fallback
      }
    }

    // Emit event for external handlers (backward compatibility)
    this.emitter.emit('integration:linear', payload);
  }

  /**
   * Execute Linear action directly via LinearClient
   */
  private async executeLinearAction(payload: LinearIssuePayload): Promise<void> {
    if (!this.linearClient) return;

    const { feature, teamId, projectId, priority, action } = payload;

    switch (action) {
      case 'create': {
        const issue = await this.linearClient.createIssue({
          title: feature.title || 'Untitled Feature',
          description: feature.description || '',
          teamId: teamId!,
          projectId,
          priority,
        });
        logger.info(
          `Created Linear issue: ${issue.identifier} (${issue.url}) for feature ${feature.id}`
        );
        break;
      }

      case 'update': {
        // For updates, we'd need the Linear issue ID stored on the feature
        // Since we don't have that yet, we'll use search to find the issue
        const issues = await this.linearClient.searchIssues({
          query: feature.title,
          teamId,
          limit: 1,
        });

        if (issues.length > 0) {
          const issue = issues[0];
          // Map feature status to Linear state
          // Note: This would require knowing the team's workflow states
          logger.info(`Found matching Linear issue: ${issue.identifier} for feature ${feature.id}`);
          // For now, just log - full status mapping requires workflow state lookup
        }
        break;
      }

      case 'comment': {
        // Find the issue and add a completion comment
        const issues = await this.linearClient.searchIssues({
          query: feature.title,
          teamId,
          limit: 1,
        });

        if (issues.length > 0) {
          const issue = issues[0];
          await this.linearClient.addComment(
            issue.id,
            `✅ **Feature completed in Automaker**\n\n` +
              `Feature: ${feature.title}\n` +
              `Status: ${feature.status}\n` +
              (feature.branchName ? `Branch: \`${feature.branchName}\`\n` : '')
          );
          logger.info(`Added completion comment to Linear issue: ${issue.identifier}`);
        }
        break;
      }
    }
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

    await this.emitLinearEvent({
      projectPath,
      featureId,
      feature,
      teamId: integrations.linear.teamId,
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
}

// Singleton instance
export const integrationService = new IntegrationService();
