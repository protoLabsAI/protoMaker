/**
 * Discord Service - Wraps Discord MCP operations with error handling
 *
 * Provides a type-safe service layer for Discord operations that:
 * - Wraps Discord MCP tool calls with proper error handling
 * - Classifies errors and provides user-friendly messages
 * - Logs operations and errors for debugging
 * - Returns structured results with success/error states
 *
 * This service assumes Discord MCP server is configured and available.
 * To set up Discord MCP:
 * 1. Build discord-mcp Docker image (see /discord plugin docs)
 * 2. Configure in settings with DISCORD_TOKEN and DISCORD_GUILD_ID
 */

import { createLogger } from '@protolabsai/utils';
import type {
  DiscordChannel,
  DiscordCategory,
  DiscordServerInfo,
  DiscordMessage,
  DiscordWebhook,
  DiscordUser,
  CreateChannelOptions,
  CreateCategoryOptions,
  DiscordSendMessageOptions,
  ReadMessagesOptions,
  CreateWebhookOptions,
  SendWebhookMessageOptions,
  DiscordOperationResult,
} from '@protolabsai/types';
import type { ClaudeProvider } from '../providers/claude-provider.js';

const logger = createLogger('DiscordService');

/**
 * Audit-specific types for channel reorganization
 */
export interface AuditIssue {
  type:
    | 'empty_category'
    | 'inactive_channel'
    | 'duplicate_name'
    | 'orphaned_channel'
    | 'unused_webhook';
  severity: 'low' | 'medium' | 'high';
  channelId?: string;
  channelName?: string;
  categoryId?: string;
  categoryName?: string;
  description: string;
  recommendation: string;
}

export interface ChannelAuditResult {
  serverName: string;
  totalChannels: number;
  totalCategories: number;
  issues: AuditIssue[];
  summary: {
    emptyCategories: number;
    inactiveChannels: number;
    duplicateNames: number;
    orphanedChannels: number;
    unusedWebhooks: number;
  };
}

/**
 * Parse error from Discord MCP operation and return error type
 */
function parseDiscordError(error: unknown): {
  type: 'connection' | 'permission' | 'not_found' | 'rate_limit' | 'unknown';
  message: string;
} {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Connection errors
  if (
    lowerMessage.includes('connect') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('econnrefused')
  ) {
    return { type: 'connection', message: 'Discord MCP server is not available or not responding' };
  }

  // Permission errors
  if (
    lowerMessage.includes('permission') ||
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('403')
  ) {
    return {
      type: 'permission',
      message: 'Discord bot lacks required permissions for this operation',
    };
  }

  // Not found errors
  if (
    lowerMessage.includes('not found') ||
    lowerMessage.includes('404') ||
    /unknown\s+(channel|user|guild|member|role|message)/.test(lowerMessage)
  ) {
    return { type: 'not_found', message: 'Discord channel, user, or resource not found' };
  }

  // Rate limit errors
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('429')) {
    return {
      type: 'rate_limit',
      message: 'Discord API rate limit exceeded, please try again later',
    };
  }

  // Unknown errors
  return { type: 'unknown', message: errorMessage };
}

/**
 * Discord Service
 *
 * Wraps Discord MCP operations with error handling and logging.
 * All methods return DiscordOperationResult with success/error states.
 */
export class DiscordService {
  private provider: ClaudeProvider | null;

  constructor(provider?: ClaudeProvider) {
    this.provider = provider ?? null;
  }

  /**
   * Get Discord server information
   */
  async getServerInfo(): Promise<DiscordOperationResult<DiscordServerInfo>> {
    try {
      logger.info('Getting Discord server info');

      // Call Discord MCP tool via provider
      // Note: This is a placeholder - actual implementation would use provider.executeQuery
      // with MCP tool call for mcp__discord__get_server_info

      // For now, return a mock result to demonstrate the pattern
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error('Failed to get server info:', message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * List all channels in the Discord server
   */
  async listChannels(): Promise<DiscordOperationResult<DiscordChannel[]>> {
    try {
      logger.info('Listing Discord channels');

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error('Failed to list channels:', message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Find a channel by name
   */
  async findChannel(channelName: string): Promise<DiscordOperationResult<DiscordChannel>> {
    try {
      logger.info(`Finding channel: ${channelName}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to find channel ${channelName}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Create a new text channel
   */
  async createTextChannel(
    options: CreateChannelOptions
  ): Promise<DiscordOperationResult<DiscordChannel>> {
    try {
      logger.info(`Creating text channel: ${options.name}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to create channel ${options.name}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Delete a channel
   */
  async deleteChannel(channelId: string): Promise<DiscordOperationResult<void>> {
    try {
      logger.info(`Deleting channel: ${channelId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to delete channel ${channelId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Create a new category
   */
  async createCategory(
    options: CreateCategoryOptions
  ): Promise<DiscordOperationResult<DiscordCategory>> {
    try {
      logger.info(`Creating category: ${options.name}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to create category ${options.name}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Find a category by name
   */
  async findCategory(categoryName: string): Promise<DiscordOperationResult<DiscordCategory>> {
    try {
      logger.info(`Finding category: ${categoryName}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to find category ${categoryName}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Delete a category
   */
  async deleteCategory(categoryId: string): Promise<DiscordOperationResult<void>> {
    try {
      logger.info(`Deleting category: ${categoryId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to delete category ${categoryId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * List channels in a category
   */
  async listChannelsInCategory(
    categoryId: string
  ): Promise<DiscordOperationResult<DiscordChannel[]>> {
    try {
      logger.info(`Listing channels in category: ${categoryId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to list channels in category ${categoryId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(
    options: DiscordSendMessageOptions
  ): Promise<DiscordOperationResult<DiscordMessage>> {
    try {
      logger.info(`Sending message to channel: ${options.channelId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to send message to channel ${options.channelId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Send a rich embed to a channel
   */
  async sendEmbed(options: {
    channelId: string;
    embed: {
      title: string;
      description?: string;
      color?: number;
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      footer?: { text: string };
      timestamp?: string;
    };
  }): Promise<DiscordOperationResult<DiscordMessage>> {
    try {
      logger.info(`Sending embed to channel: ${options.channelId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to send embed to channel ${options.channelId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Read recent messages from a channel
   */
  async readMessages(
    options: ReadMessagesOptions
  ): Promise<DiscordOperationResult<DiscordMessage[]>> {
    try {
      logger.info(`Reading messages from channel: ${options.channelId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to read messages from channel ${options.channelId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Edit a message
   */
  async editMessage(
    channelId: string,
    messageId: string,
    _newContent: string
  ): Promise<DiscordOperationResult<DiscordMessage>> {
    try {
      logger.info(`Editing message ${messageId} in channel ${channelId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to edit message ${messageId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(channelId: string, messageId: string): Promise<DiscordOperationResult<void>> {
    try {
      logger.info(`Deleting message ${messageId} from channel ${channelId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to delete message ${messageId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Create a webhook in a channel
   */
  async createWebhook(
    options: CreateWebhookOptions
  ): Promise<DiscordOperationResult<DiscordWebhook>> {
    try {
      logger.info(`Creating webhook in channel: ${options.channelId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to create webhook in channel ${options.channelId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * List webhooks in a channel
   */
  async listWebhooks(channelId: string): Promise<DiscordOperationResult<DiscordWebhook[]>> {
    try {
      logger.info(`Listing webhooks in channel: ${channelId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to list webhooks in channel ${channelId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Send a message via webhook
   */
  async sendWebhookMessage(
    _options: SendWebhookMessageOptions
  ): Promise<DiscordOperationResult<void>> {
    try {
      logger.info('Sending webhook message');

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error('Failed to send webhook message:', message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<DiscordOperationResult<void>> {
    try {
      logger.info(`Deleting webhook: ${webhookId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to delete webhook ${webhookId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<DiscordOperationResult<void>> {
    try {
      logger.info(`Adding reaction ${emoji} to message ${messageId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to add reaction to message ${messageId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<DiscordOperationResult<void>> {
    try {
      logger.info(`Removing reaction ${emoji} from message ${messageId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to remove reaction from message ${messageId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Send a private message to a user
   */
  async sendPrivateMessage(
    userId: string,
    _message: string
  ): Promise<DiscordOperationResult<DiscordMessage>> {
    try {
      logger.info(`Sending private message to user: ${userId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message: errorMsg } = parseDiscordError(error);
      logger.error(`Failed to send private message to user ${userId}:`, errorMsg);
      return {
        success: false,
        error: errorMsg,
        errorType: type,
      };
    }
  }

  /**
   * Read private messages with a user
   */
  async readPrivateMessages(
    userId: string,
    _count?: number
  ): Promise<DiscordOperationResult<DiscordMessage[]>> {
    try {
      logger.info(`Reading private messages with user: ${userId}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to read private messages with user ${userId}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Get user ID by username
   */
  async getUserByName(username: string): Promise<DiscordOperationResult<DiscordUser>> {
    try {
      logger.info(`Getting user ID for: ${username}`);

      // Call Discord MCP tool via provider
      throw new Error('Discord MCP integration not yet implemented in provider layer');
    } catch (error) {
      const { type, message } = parseDiscordError(error);
      logger.error(`Failed to get user ${username}:`, message);
      return {
        success: false,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Audit channels in the Discord server
   *
   * Scans the guild and identifies:
   * - Empty categories (categories with no channels)
   * - Inactive channels (no messages in 30+ days)
   * - Duplicate channel names
   * - Orphaned channels (not in any category)
   * - Unused webhooks
   *
   * @returns Audit results with cleanup recommendations
   */
  async auditChannels(): Promise<ChannelAuditResult> {
    logger.info('Starting Discord channel audit');
    logger.warn('Discord MCP integration not yet implemented for channel audit');
    throw new Error('Discord MCP integration not yet implemented');
  }

  /**
   * Get channel statistics
   */
  async getChannelStats(): Promise<{
    textChannels: number;
    voiceChannels: number;
    categories: number;
    orphanedChannels: number;
  }> {
    logger.info('Getting channel statistics');
    throw new Error('Discord MCP integration not yet implemented');
  }

  /**
   * Validate channel structure against expected organization
   */
  async validateStructure(_expectedCategories: string[]): Promise<{
    valid: boolean;
    missingCategories: string[];
    unexpectedCategories: string[];
  }> {
    logger.info('Validating channel structure');
    throw new Error('Discord MCP integration not yet implemented');
  }
}

// Singleton instance
let discordServiceInstance: DiscordService | null = null;

/**
 * Get or create the singleton Discord service instance
 * @param provider - Claude provider for MCP tool execution
 */
export function getDiscordService(provider?: ClaudeProvider): DiscordService {
  if (!discordServiceInstance) {
    discordServiceInstance = new DiscordService(provider);
  }
  return discordServiceInstance;
}

/**
 * Reset the singleton instance (for testing only)
 */
export function _resetDiscordServiceForTesting(): void {
  discordServiceInstance = null;
}
