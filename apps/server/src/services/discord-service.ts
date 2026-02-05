/**
 * Discord Service - Channel audit and cleanup functionality
 *
 * Provides functionality to audit Discord servers for:
 * - Empty categories (no channels)
 * - Inactive channels (30+ days without messages)
 * - Duplicate channel names
 * - Orphaned channels (no category)
 * - Webhook security issues (unused webhooks)
 */

import { createLogger } from '@automaker/utils';
import type {
  ChannelAuditResult,
  DiscordChannel,
  DiscordCategory,
  DiscordWebhook,
  EmptyCategoryFinding,
  InactiveChannelFinding,
  DuplicateNameFinding,
  OrphanedChannelFinding,
  WebhookSecurityFinding,
  DiscordChannelType,
} from '@automaker/types';

const logger = createLogger('DiscordService');

/**
 * Options for channel audit
 */
export interface AuditChannelsOptions {
  /**
   * Guild (server) ID to audit
   */
  guildId: string;

  /**
   * Guild name (optional, for display)
   */
  guildName?: string;

  /**
   * Number of days to consider a channel inactive (default: 30)
   */
  inactivityThresholdDays?: number;

  /**
   * Whether to include webhook audit (default: true)
   */
  includeWebhookAudit?: boolean;
}

/**
 * DiscordService - Provides channel auditing and cleanup recommendations
 *
 * This service analyzes Discord server structure and identifies:
 * - Organizational issues (empty categories, orphaned channels)
 * - Activity issues (inactive channels)
 * - Naming issues (duplicate names)
 * - Security issues (unused webhooks)
 */
export class DiscordService {
  private readonly INACTIVITY_THRESHOLD_DAYS = 30;

  /**
   * Audit a Discord guild's channels and provide cleanup recommendations
   *
   * @param options - Audit options including guild ID and thresholds
   * @returns Complete audit results with findings and recommendations
   */
  async auditChannels(options: AuditChannelsOptions): Promise<ChannelAuditResult> {
    const {
      guildId,
      guildName = 'Unknown Server',
      inactivityThresholdDays = this.INACTIVITY_THRESHOLD_DAYS,
      includeWebhookAudit = true,
    } = options;

    logger.info(`Starting channel audit for guild ${guildId} (${guildName})`);

    try {
      // In a real implementation, these would call Discord MCP tools
      // For now, we'll structure the service to accept data that would come from MCP
      const channels = await this.getChannels(guildId);
      const categories = await this.getCategories(guildId, channels);
      const webhooks = includeWebhookAudit ? await this.getWebhooks(guildId) : [];

      // Perform audits
      const emptyCategories = this.findEmptyCategories(categories);
      const inactiveChannels = await this.findInactiveChannels(
        channels,
        inactivityThresholdDays
      );
      const duplicateNames = this.findDuplicateNames(channels);
      const orphanedChannels = this.findOrphanedChannels(channels);
      const webhookIssues = includeWebhookAudit
        ? this.auditWebhooks(webhooks, channels)
        : [];

      // Generate summary
      const summary = {
        totalChannels: channels.length,
        totalCategories: categories.length,
        totalWebhooks: webhooks.length,
        emptyCategories: emptyCategories.length,
        inactiveChannels: inactiveChannels.length,
        duplicateNames: duplicateNames.length,
        orphanedChannels: orphanedChannels.length,
        webhookIssues: webhookIssues.length,
      };

      // Generate overall recommendations
      const recommendations = this.generateRecommendations(summary);

      const result: ChannelAuditResult = {
        guildId,
        guildName,
        auditedAt: new Date().toISOString(),
        summary,
        findings: {
          emptyCategories,
          inactiveChannels,
          duplicateNames,
          orphanedChannels,
          webhookIssues,
        },
        recommendations,
      };

      logger.info(
        `Channel audit complete for ${guildName}: ${summary.emptyCategories} empty categories, ${summary.inactiveChannels} inactive channels, ${summary.duplicateNames} duplicate names, ${summary.orphanedChannels} orphaned channels, ${summary.webhookIssues} webhook issues`
      );

      return result;
    } catch (error) {
      logger.error(`Error auditing channels for guild ${guildId}:`, error);
      throw new Error(`Failed to audit channels: ${(error as Error).message}`);
    }
  }

  /**
   * Get all channels in a guild
   * In production, this would use Discord MCP tools
   *
   * @param guildId - Guild ID
   * @returns Array of channels
   */
  private async getChannels(guildId: string): Promise<DiscordChannel[]> {
    // TODO: Integrate with Discord MCP tools
    // Example: mcp__discord__list_channels()
    logger.debug(`Fetching channels for guild ${guildId}`);
    return [];
  }

  /**
   * Organize channels into categories
   *
   * @param guildId - Guild ID
   * @param channels - All channels
   * @returns Array of categories with their channels
   */
  private async getCategories(
    guildId: string,
    channels: DiscordChannel[]
  ): Promise<DiscordCategory[]> {
    // Group channels by category
    const categoryMap = new Map<string, DiscordChannel[]>();

    // Find all category-type channels
    const categoryChannels = channels.filter((c) => c.type === 'CATEGORY');

    // Initialize categories
    for (const category of categoryChannels) {
      categoryMap.set(category.id, []);
    }

    // Group non-category channels
    for (const channel of channels) {
      if (channel.type !== 'CATEGORY' && channel.categoryId) {
        const categoryChannels = categoryMap.get(channel.categoryId) || [];
        categoryChannels.push(channel);
        categoryMap.set(channel.categoryId, categoryChannels);
      }
    }

    // Build category objects
    return categoryChannels.map((category) => ({
      id: category.id,
      name: category.name,
      channels: categoryMap.get(category.id) || [],
      position: category.position,
    }));
  }

  /**
   * Get all webhooks in a guild
   * In production, this would use Discord MCP tools
   *
   * @param guildId - Guild ID
   * @returns Array of webhooks
   */
  private async getWebhooks(guildId: string): Promise<DiscordWebhook[]> {
    // TODO: Integrate with Discord MCP tools
    // Example: mcp__discord__list_webhooks() for each channel
    logger.debug(`Fetching webhooks for guild ${guildId}`);
    return [];
  }

  /**
   * Find empty categories (categories with no channels)
   *
   * @param categories - All categories
   * @returns Array of empty category findings
   */
  private findEmptyCategories(categories: DiscordCategory[]): EmptyCategoryFinding[] {
    return categories
      .filter((category) => category.channels.length === 0)
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        reason: 'no_channels' as const,
        recommendation: `Delete category "${category.name}" as it contains no channels`,
      }));
  }

  /**
   * Find inactive channels (no messages in threshold days)
   * In production, this would check message history via Discord MCP
   *
   * @param channels - All channels
   * @param thresholdDays - Number of days to consider inactive
   * @returns Array of inactive channel findings
   */
  private async findInactiveChannels(
    channels: DiscordChannel[],
    thresholdDays: number
  ): Promise<InactiveChannelFinding[]> {
    // TODO: Integrate with Discord MCP tools to check message history
    // Example: mcp__discord__read_messages({ channelId, count: 1 })
    // For now, return empty array as we can't check message history
    logger.debug(
      `Checking for channels inactive for ${thresholdDays}+ days (requires message history)`
    );

    // In production implementation:
    // 1. For each TEXT/ANNOUNCEMENT channel
    // 2. Fetch last message timestamp
    // 3. Calculate days since last message
    // 4. If > thresholdDays, add to findings

    return [];
  }

  /**
   * Find channels with duplicate names
   *
   * @param channels - All channels
   * @returns Array of duplicate name findings
   */
  private findDuplicateNames(channels: DiscordChannel[]): DuplicateNameFinding[] {
    // Group channels by name (excluding categories)
    const nameMap = new Map<string, DiscordChannel[]>();

    for (const channel of channels) {
      if (channel.type === 'CATEGORY') continue;

      const existing = nameMap.get(channel.name) || [];
      existing.push(channel);
      nameMap.set(channel.name, existing);
    }

    // Find duplicates
    const duplicates: DuplicateNameFinding[] = [];

    for (const [name, channelList] of nameMap.entries()) {
      if (channelList.length > 1) {
        duplicates.push({
          channelName: name,
          channels: channelList.map((c) => ({
            channelId: c.id,
            categoryId: c.categoryId,
            categoryName: c.categoryName,
          })),
          count: channelList.length,
          reason: 'duplicate_names' as const,
          recommendation: `Rename or merge duplicate channels named "${name}" (${channelList.length} instances found)`,
        });
      }
    }

    return duplicates;
  }

  /**
   * Find orphaned channels (channels not in any category)
   *
   * @param channels - All channels
   * @returns Array of orphaned channel findings
   */
  private findOrphanedChannels(channels: DiscordChannel[]): OrphanedChannelFinding[] {
    return channels
      .filter((channel) => channel.type !== 'CATEGORY' && !channel.categoryId)
      .map((channel) => ({
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
        reason: 'no_category' as const,
        recommendation: `Move channel "${channel.name}" into an appropriate category for better organization`,
      }));
  }

  /**
   * Audit webhooks for security issues
   *
   * @param webhooks - All webhooks
   * @param channels - All channels (for validation)
   * @returns Array of webhook security findings
   */
  private auditWebhooks(
    webhooks: DiscordWebhook[],
    channels: DiscordChannel[]
  ): WebhookSecurityFinding[] {
    const findings: WebhookSecurityFinding[] = [];

    // Group webhooks by channel
    const webhooksByChannel = new Map<string, DiscordWebhook[]>();
    for (const webhook of webhooks) {
      const existing = webhooksByChannel.get(webhook.channelId) || [];
      existing.push(webhook);
      webhooksByChannel.set(webhook.channelId, existing);
    }

    // Check for channels with multiple webhooks (potential duplicates)
    for (const [channelId, channelWebhooks] of webhooksByChannel.entries()) {
      if (channelWebhooks.length > 3) {
        const channel = channels.find((c) => c.id === channelId);
        findings.push({
          webhookId: channelWebhooks[0].id,
          webhookName: `Multiple webhooks in ${channel?.name || 'unknown'}`,
          channelId,
          channelName: channel?.name,
          reason: 'duplicate' as const,
          recommendation: `Channel has ${channelWebhooks.length} webhooks - review and remove unused ones`,
          metadata: {
            duplicateCount: channelWebhooks.length,
          },
        });
      }
    }

    // TODO: In production, check webhook usage via message history
    // Mark webhooks that haven't been used in 30+ days as potentially unused

    return findings;
  }

  /**
   * Generate overall recommendations based on audit summary
   *
   * @param summary - Audit summary statistics
   * @returns Array of recommendation strings
   */
  private generateRecommendations(summary: {
    totalChannels: number;
    totalCategories: number;
    totalWebhooks: number;
    emptyCategories: number;
    inactiveChannels: number;
    duplicateNames: number;
    orphanedChannels: number;
    webhookIssues: number;
  }): string[] {
    const recommendations: string[] = [];

    if (summary.emptyCategories > 0) {
      recommendations.push(
        `Remove ${summary.emptyCategories} empty ${summary.emptyCategories === 1 ? 'category' : 'categories'} to declutter server structure`
      );
    }

    if (summary.inactiveChannels > 0) {
      recommendations.push(
        `Archive or delete ${summary.inactiveChannels} inactive ${summary.inactiveChannels === 1 ? 'channel' : 'channels'} (30+ days without messages)`
      );
    }

    if (summary.duplicateNames > 0) {
      recommendations.push(
        `Resolve ${summary.duplicateNames} duplicate channel name ${summary.duplicateNames === 1 ? 'conflict' : 'conflicts'} by renaming or merging`
      );
    }

    if (summary.orphanedChannels > 0) {
      recommendations.push(
        `Organize ${summary.orphanedChannels} orphaned ${summary.orphanedChannels === 1 ? 'channel' : 'channels'} into appropriate categories`
      );
    }

    if (summary.webhookIssues > 0) {
      recommendations.push(
        `Review and clean up ${summary.webhookIssues} webhook ${summary.webhookIssues === 1 ? 'issue' : 'issues'} for security`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('No issues found - server organization is healthy!');
    }

    return recommendations;
  }

  /**
   * Helper to map Discord API channel type to our type
   *
   * @param apiType - Discord API channel type number
   * @returns DiscordChannelType
   */
  private mapChannelType(apiType: number): DiscordChannelType {
    // Discord API channel types
    // https://discord.com/developers/docs/resources/channel#channel-object-channel-types
    switch (apiType) {
      case 0:
        return 'TEXT';
      case 2:
        return 'VOICE';
      case 4:
        return 'CATEGORY';
      case 5:
        return 'ANNOUNCEMENT';
      case 10:
      case 11:
      case 12:
        return 'THREAD';
      default:
        return 'UNKNOWN';
    }
  }
}

/**
 * Singleton instance
 */
export const discordService = new DiscordService();
