/**
 * Discord Service Types
 *
 * Type definitions for Discord service layer that wraps Discord MCP operations.
 */

/**
 * Discord channel types
 */
export type DiscordChannelType = 'TEXT' | 'VOICE' | 'CATEGORY';

/**
 * Discord channel information
 */
export interface DiscordChannel {
  id: string;
  name: string;
  type: DiscordChannelType;
  categoryId?: string;
  categoryName?: string;
}

/**
 * Discord category information
 */
export interface DiscordCategory {
  id: string;
  name: string;
  channelCount: number;
}

/**
 * Discord server information
 */
export interface DiscordServerInfo {
  id: string;
  name: string;
  memberCount: number;
  channels: DiscordChannel[];
  categories: DiscordCategory[];
}

/**
 * Discord message
 */
export interface DiscordMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
}

/**
 * Discord webhook information
 */
export interface DiscordWebhook {
  id: string;
  channelId: string;
  name: string;
  url: string;
}

/**
 * Discord user information
 */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
}

/**
 * Options for creating a text channel
 */
export interface CreateChannelOptions {
  name: string;
  categoryId?: string;
  topic?: string;
}

/**
 * Options for creating a category
 */
export interface CreateCategoryOptions {
  name: string;
}

/**
 * Options for sending a Discord message
 */
export interface DiscordSendMessageOptions {
  channelId: string;
  message: string;
}

/**
 * Options for reading messages
 */
export interface ReadMessagesOptions {
  channelId: string;
  count?: number;
}

/**
 * Options for creating a webhook
 */
export interface CreateWebhookOptions {
  channelId: string;
  name: string;
}

/**
 * Options for sending a webhook message
 */
export interface SendWebhookMessageOptions {
  webhookUrl: string;
  message: string;
}

/**
 * Result of a Discord operation
 */
export interface DiscordOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorType?: 'connection' | 'permission' | 'not_found' | 'rate_limit' | 'unknown';
}
