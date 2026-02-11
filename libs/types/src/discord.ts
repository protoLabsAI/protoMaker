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
 * Discord DM message
 *
 * Represents a direct message that can be sent or received by agents.
 * Agents can send DMs to their assigned human by username lookup.
 */
export interface DiscordDMMessage {
  /** Message ID (if received) */
  id?: string;
  /** Username to send to or username of sender */
  username: string;
  /** Message content */
  content: string;
  /** ISO timestamp when message was sent/received */
  timestamp: string;
  /** Direction of the message */
  direction: 'sent' | 'received';
  /** Agent role that sent the message (if sent by agent) */
  agentRole?: string;
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

/**
 * Attachment data processed from Discord
 */
export interface DiscordAttachment {
  textFiles?: Array<{ filename: string; content: string }>;
  imagePaths?: string[];
}

/**
 * Reply context - the message being replied to
 */
export interface DiscordReplyContext {
  messageId: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
}

/**
 * Message routed to an agent with full context
 */
export interface DiscordRoutedMessage {
  /** The triggering message */
  message: DiscordMessage;
  /** Last N messages from the channel for conversational context */
  recentMessages: DiscordMessage[];
  /** Processed attachments (images, files) from the triggering message */
  attachments: DiscordAttachment;
  /** Reply context if the message is a reply */
  replyTo?: DiscordReplyContext;
  /** The user routing config that triggered this route */
  routingConfig: {
    userId: string;
    agentType: string;
    enabled: boolean;
  };
}
