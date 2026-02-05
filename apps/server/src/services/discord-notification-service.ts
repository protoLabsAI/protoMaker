/**
 * Discord Notification Service - Sends notifications to Discord via MCP server
 *
 * Integrates with the Discord MCP server to post feature lifecycle events
 * to configured Discord channels. Supports:
 * - Feature created → #features channel
 * - Feature completed with PR link → #completions channel
 * - Feature error with context → #errors channel
 *
 * Requires Discord MCP server to be configured in Claude Code settings.
 */

import { createLogger } from '@automaker/utils';
import type { Feature, ProjectSettings } from '@automaker/types';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('DiscordNotificationService');

export interface DiscordNotificationOptions {
  projectPath: string;
  settingsService: SettingsService;
}

/**
 * Discord Notification Service - Posts feature lifecycle events to Discord
 *
 * Uses the Discord MCP server (mcp__discord__send_message) to post notifications
 * when features are created, completed, or encounter errors.
 */
export class DiscordNotificationService {
  private settingsService: SettingsService;

  constructor(options: DiscordNotificationOptions) {
    this.settingsService = options.settingsService;
  }

  /**
   * Get Discord configuration from project settings
   */
  private async getDiscordConfig(projectPath: string): Promise<
    | {
        enabled: boolean;
        featuresChannelId?: string;
        completionsChannelId?: string;
        errorsChannelId?: string;
      }
    | undefined
  > {
    const projectSettings = await this.settingsService.getProjectSettings(projectPath);
    // Type assertion needed until types are updated in workspace
    return (projectSettings as ProjectSettings & { discordConfig?: { enabled: boolean; featuresChannelId?: string; completionsChannelId?: string; errorsChannelId?: string } }).discordConfig;
  }

  /**
   * Check if Discord notifications are enabled for a project
   */
  async isEnabled(projectPath: string): Promise<boolean> {
    const config = await this.getDiscordConfig(projectPath);
    return config?.enabled === true;
  }

  /**
   * Send a message to a Discord channel via MCP
   * Returns true if successful, false if Discord MCP is not available or if sending fails
   */
  private async sendToDiscord(channelId: string, message: string): Promise<boolean> {
    try {
      // Check if Discord MCP tools are available
      // We'll attempt to call the MCP tool via the global MCP client if available
      // For now, we'll log and return false since MCP integration needs to be wired up
      // TODO: Wire up MCP client access in the service
      logger.info(`[DISCORD] Would send to channel ${channelId}: ${message.substring(0, 100)}...`);

      // Placeholder: In production, this would call:
      // await mcpClient.callTool('mcp__discord__send_message', { channelId, message });

      return false; // Return false until MCP integration is complete
    } catch (error) {
      logger.error(`Failed to send Discord message to channel ${channelId}:`, error);
      return false;
    }
  }

  /**
   * Send feature created notification
   *
   * Posts to #features channel with basic feature info
   */
  async notifyFeatureCreated(
    projectPath: string,
    feature: Feature
  ): Promise<void> {
    const config = await this.getDiscordConfig(projectPath);
    if (!config?.enabled || !config.featuresChannelId) {
      return;
    }

    const projectName = projectPath.split('/').pop() || 'unknown';
    const message = `🆕 **New Feature Created**

**Project**: ${projectName}
**Title**: ${feature.title || 'Untitled'}
**Description**: ${feature.description || 'No description'}
**Status**: ${feature.status}
**Complexity**: ${feature.complexity || 'medium'}`;

    const sent = await this.sendToDiscord(config.featuresChannelId, message);
    if (sent) {
      logger.info(`Sent feature created notification for ${feature.id} to Discord`);
    }
  }

  /**
   * Send feature completed notification with PR link
   *
   * Posts to #completions channel with PR link and completion details
   */
  async notifyFeatureCompleted(
    projectPath: string,
    feature: Feature,
    prUrl?: string
  ): Promise<void> {
    const config = await this.getDiscordConfig(projectPath);
    if (!config?.enabled || !config.completionsChannelId) {
      return;
    }

    const projectName = projectPath.split('/').pop() || 'unknown';
    let message = `✅ **Feature Completed**

**Project**: ${projectName}
**Title**: ${feature.title || 'Untitled'}
**Status**: ${feature.status}`;

    if (prUrl) {
      message += `\n**Pull Request**: ${prUrl}`;
    }

    const sent = await this.sendToDiscord(config.completionsChannelId, message);
    if (sent) {
      logger.info(`Sent feature completed notification for ${feature.id} to Discord`);
    }
  }

  /**
   * Send feature error notification with context
   *
   * Posts to #errors channel with error details and feature context
   */
  async notifyFeatureError(
    projectPath: string,
    feature: Feature,
    errorMessage: string,
    errorContext?: string
  ): Promise<void> {
    const config = await this.getDiscordConfig(projectPath);
    if (!config?.enabled || !config.errorsChannelId) {
      return;
    }

    const projectName = projectPath.split('/').pop() || 'unknown';
    let message = `❌ **Feature Error**

**Project**: ${projectName}
**Title**: ${feature.title || 'Untitled'}
**Feature ID**: ${feature.id}
**Error**: ${errorMessage}`;

    if (errorContext) {
      message += `\n**Context**: ${errorContext}`;
    }

    const sent = await this.sendToDiscord(config.errorsChannelId, message);
    if (sent) {
      logger.info(`Sent feature error notification for ${feature.id} to Discord`);
    }
  }
}

// Singleton instance
let discordNotificationServiceInstance: DiscordNotificationService | null = null;

/**
 * Get the singleton Discord notification service instance
 */
export function getDiscordNotificationService(settingsService: SettingsService): DiscordNotificationService {
  if (!discordNotificationServiceInstance) {
    discordNotificationServiceInstance = new DiscordNotificationService({
      projectPath: '', // Not needed for singleton
      settingsService,
    });
  }
  return discordNotificationServiceInstance;
}
