/**
 * Discord Service Types
 *
 * Type definitions for Discord server auditing and cleanup
 */

/**
 * Channel type from Discord API
 */
export type DiscordChannelType = 'TEXT' | 'VOICE' | 'CATEGORY' | 'ANNOUNCEMENT' | 'THREAD' | 'UNKNOWN';

/**
 * Basic channel information
 */
export interface DiscordChannel {
  id: string;
  name: string;
  type: DiscordChannelType;
  categoryId?: string;
  categoryName?: string;
  position?: number;
}

/**
 * Category information
 */
export interface DiscordCategory {
  id: string;
  name: string;
  channels: DiscordChannel[];
  position?: number;
}

/**
 * Webhook information
 */
export interface DiscordWebhook {
  id: string;
  name: string;
  channelId: string;
  channelName?: string;
  url?: string;
  createdAt?: string;
}

/**
 * Empty category audit finding
 */
export interface EmptyCategoryFinding {
  categoryId: string;
  categoryName: string;
  reason: 'no_channels';
  recommendation: string;
}

/**
 * Inactive channel audit finding
 */
export interface InactiveChannelFinding {
  channelId: string;
  channelName: string;
  channelType: DiscordChannelType;
  categoryId?: string;
  categoryName?: string;
  daysSinceLastMessage: number;
  reason: 'inactive_30_plus_days';
  recommendation: string;
}

/**
 * Duplicate name audit finding
 */
export interface DuplicateNameFinding {
  channelName: string;
  channels: Array<{
    channelId: string;
    categoryId?: string;
    categoryName?: string;
  }>;
  count: number;
  reason: 'duplicate_names';
  recommendation: string;
}

/**
 * Orphaned channel audit finding
 */
export interface OrphanedChannelFinding {
  channelId: string;
  channelName: string;
  channelType: DiscordChannelType;
  reason: 'no_category';
  recommendation: string;
}

/**
 * Webhook security audit finding
 */
export interface WebhookSecurityFinding {
  webhookId: string;
  webhookName: string;
  channelId: string;
  channelName?: string;
  reason: 'unused' | 'duplicate' | 'suspicious';
  recommendation: string;
  metadata?: {
    duplicateCount?: number;
    lastUsed?: string;
  };
}

/**
 * Complete channel audit results
 */
export interface ChannelAuditResult {
  guildId: string;
  guildName: string;
  auditedAt: string;
  summary: {
    totalChannels: number;
    totalCategories: number;
    totalWebhooks: number;
    emptyCategories: number;
    inactiveChannels: number;
    duplicateNames: number;
    orphanedChannels: number;
    webhookIssues: number;
  };
  findings: {
    emptyCategories: EmptyCategoryFinding[];
    inactiveChannels: InactiveChannelFinding[];
    duplicateNames: DuplicateNameFinding[];
    orphanedChannels: OrphanedChannelFinding[];
    webhookIssues: WebhookSecurityFinding[];
  };
  recommendations: string[];
}
