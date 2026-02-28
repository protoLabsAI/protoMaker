/**
 * Discord Monitor Service
 *
 * Monitors Discord channels for messages and work items for headsdown agents.
 * Used by Product Manager agents to detect user requests and engage in conversation.
 */

import type { EventEmitter } from '../lib/events.js';
import type {
  DiscordMonitorConfig,
  DiscordChannelSignalConfig,
  WorkItem,
} from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('DiscordMonitor');

/**
 * Minimal interface for the Discord bot service methods used by the monitor.
 * Avoids importing the full DiscordBotService class (circular dependency risk).
 */
export interface DiscordBotServiceLike {
  readMessages(
    channelId: string,
    limit: number
  ): Promise<
    Array<{
      id: string;
      content: string;
      author?: { id?: string; username?: string };
      timestamp?: string;
      mentions?: string[];
      hasAttachments?: boolean;
    }>
  >;
}

/**
 * Discord message with metadata
 */
export interface DiscordMessageItem {
  id: string;
  channelId: string;
  threadId?: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  mentions: string[];
  hasAttachments: boolean;
}

/**
 * DiscordMonitor - Polls Discord channels for new messages
 *
 * Used by headsdown agents (especially Product Manager) to detect:
 * - User requests in planning channels
 * - Mentions or trigger keywords
 * - Questions needing PM engagement
 */
export class DiscordMonitor {
  /** Last message ID seen per channel (to avoid processing duplicates) */
  private lastMessageIds = new Map<string, string>();

  /** Active polling intervals */
  private intervals = new Map<string, NodeJS.Timeout>();

  /** Discord bot service for reading messages */
  private discordBotService: DiscordBotServiceLike | null = null;

  constructor(private events: EventEmitter) {}

  /**
   * Set the Discord bot service for message fetching
   */
  setDiscordBotService(service: DiscordBotServiceLike): void {
    this.discordBotService = service;
  }

  /**
   * Start monitoring a Discord channel
   */
  async startMonitoring(config: DiscordMonitorConfig): Promise<void> {
    const { channelIds, keywords, pollInterval = 30000 } = config;

    for (const channelId of channelIds) {
      // Fetch initial messages to establish baseline
      try {
        const messages = await this.fetchMessages(channelId, 1);
        if (messages.length > 0) {
          this.lastMessageIds.set(channelId, messages[0].id);
        }
      } catch (error) {
        logger.error(`Failed to fetch initial messages for channel ${channelId}:`, error);
      }

      // Start polling loop
      const interval = setInterval(async () => {
        try {
          await this.pollChannel(channelId, keywords);
        } catch (error) {
          logger.error(`Error polling Discord channel ${channelId}:`, error);
        }
      }, pollInterval);

      this.intervals.set(channelId, interval);
      logger.info(`Started monitoring Discord channel ${channelId}`);
    }
  }

  /**
   * Stop monitoring a Discord channel
   */
  stopMonitoring(channelId: string): void {
    const interval = this.intervals.get(channelId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(channelId);
      this.lastMessageIds.delete(channelId);
      logger.info(`Stopped monitoring Discord channel ${channelId}`);
    }
  }

  /**
   * Stop all monitoring
   */
  stopAll(): void {
    for (const [channelId, interval] of this.intervals.entries()) {
      clearInterval(interval);
      logger.info(`Stopped monitoring Discord channel ${channelId}`);
    }
    this.intervals.clear();
    this.lastMessageIds.clear();
  }

  /**
   * Start monitoring Discord channels for signal intake.
   *
   * Unlike startMonitoring() (which filters by keywords for headsdown agents),
   * this method emits discord:message:detected for ALL new messages in configured
   * channels. Keyword filtering is handled downstream by IntegrationService.
   */
  async startChannelMonitoring(
    configs: DiscordChannelSignalConfig[],
    pollInterval = 30000
  ): Promise<void> {
    const enabledConfigs = configs.filter((c) => c.enabled);

    for (const config of enabledConfigs) {
      const { channelId } = config;

      // Skip if already monitoring this channel
      if (this.intervals.has(channelId)) {
        logger.debug(`Channel ${channelId} already being monitored, skipping`);
        continue;
      }

      // Establish baseline: record the latest message ID to avoid replaying history
      try {
        const messages = await this.fetchMessages(channelId, 1);
        if (messages.length > 0) {
          this.lastMessageIds.set(channelId, messages[0].id);
        }
      } catch (error) {
        logger.error(`Failed to fetch initial messages for channel ${channelId}:`, error);
      }

      // Start polling loop
      const interval = setInterval(async () => {
        try {
          await this.pollChannelForSignals(config);
        } catch (error) {
          logger.error(`Error polling Discord channel ${channelId} for signals:`, error);
        }
      }, pollInterval);

      this.intervals.set(channelId, interval);
      logger.info(
        `Started signal monitoring for Discord channel ${channelId} (${config.channelName})`
      );
    }
  }

  /**
   * Poll a channel for new messages and emit discord:message:detected for each.
   * Emits the flat payload format expected by IntegrationService.handleDiscordMessage.
   */
  private async pollChannelForSignals(config: DiscordChannelSignalConfig): Promise<void> {
    const { channelId, channelName } = config;
    const messages = await this.fetchMessages(channelId, 10);

    const lastId = this.lastMessageIds.get(channelId);
    const newMessages = lastId ? messages.filter((m) => BigInt(m.id) > BigInt(lastId)) : messages;

    if (newMessages.length === 0) {
      return;
    }

    // Update last seen message ID (messages are newest-first)
    this.lastMessageIds.set(channelId, newMessages[0].id);

    for (const message of newMessages) {
      this.events.emit('discord:message:detected', {
        channelId,
        channelName,
        userId: message.authorId,
        username: message.authorName,
        content: message.content,
        timestamp: message.timestamp,
      });

      logger.debug(`Emitted discord:message:detected for message ${message.id} in ${channelName}`);
    }
  }

  /**
   * Poll a channel for new messages
   */
  private async pollChannel(channelId: string, keywords: string[]): Promise<void> {
    const messages = await this.fetchMessages(channelId, 10);

    // Filter to only new messages
    const lastId = this.lastMessageIds.get(channelId);
    const newMessages = lastId ? messages.filter((m) => BigInt(m.id) > BigInt(lastId)) : messages;

    if (newMessages.length === 0) {
      return;
    }

    // Update last seen message ID
    this.lastMessageIds.set(channelId, newMessages[0].id);

    // Check each message for trigger keywords
    for (const message of newMessages) {
      const matchedKeywords = this.checkKeywords(message.content, keywords);

      if (matchedKeywords.length > 0) {
        // Emit work item event
        this.events.emit('discord:message:detected', {
          channelId,
          message,
          keywords: matchedKeywords,
        });

        logger.info(
          `Detected message in channel ${channelId} matching keywords: ${matchedKeywords.join(', ')}`
        );
      }
    }
  }

  /**
   * Fetch recent messages from a Discord channel
   */
  private async fetchMessages(channelId: string, limit: number): Promise<DiscordMessageItem[]> {
    if (!this.discordBotService) {
      logger.warn('DiscordBotService not configured - cannot fetch messages');
      return [];
    }

    try {
      const messages = await this.discordBotService.readMessages(channelId, limit);

      // Map from DiscordBotService message format to DiscordMessageItem
      return messages.map((msg) => ({
        id: msg.id,
        channelId,
        authorId: msg.author?.id || '',
        authorName: msg.author?.username || 'Unknown',
        content: msg.content,
        timestamp: msg.timestamp || new Date().toISOString(),
        mentions: msg.mentions || [],
        hasAttachments: msg.hasAttachments || false,
      }));
    } catch (error) {
      logger.error(`Failed to fetch messages from channel ${channelId}:`, error);
      return [];
    }
  }

  /**
   * Check if message content matches any trigger keywords
   */
  private checkKeywords(content: string, keywords: string[]): string[] {
    const lowerContent = content.toLowerCase();
    return keywords.filter((keyword) => lowerContent.includes(keyword.toLowerCase()));
  }

  /**
   * Convert Discord message to WorkItem for headsdown agents
   */
  static messageToWorkItem(message: DiscordMessageItem, keywords: string[]): WorkItem {
    return {
      type: 'discord_message',
      id: message.id,
      priority: 1, // High priority - user engagement
      description: `User message in Discord: "${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}"`,
      url: `https://discord.com/channels/${message.channelId}/${message.id}`,
      metadata: {
        channelId: message.channelId,
        threadId: message.threadId,
        authorId: message.authorId,
        authorName: message.authorName,
        matchedKeywords: keywords,
        timestamp: message.timestamp,
      },
    };
  }

  /**
   * Get all monitored channel IDs
   */
  getMonitoredChannels(): string[] {
    return Array.from(this.intervals.keys());
  }

  /**
   * Check if a channel is being monitored
   */
  isMonitoring(channelId: string): boolean {
    return this.intervals.has(channelId);
  }
}
