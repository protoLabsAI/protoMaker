/**
 * Agent Discord Router Service
 *
 * Manages agent-to-Discord response mapping. Receives 'discord:user-message:routed' events,
 * processes them via simpleQuery, and sends responses back to Discord. Handles message
 * splitting for long responses and thread creation for extended conversations.
 */

import type { EventEmitter } from '../lib/events.js';
import type { DiscordUserMessageRoutedPayload } from '@automaker/types';
import { createLogger, classifyError } from '@automaker/utils';
import { DiscordBotService } from './discord-bot-service.js';
import { simpleQuery } from '../providers/simple-query-service.js';

const logger = createLogger('AgentDiscordRouter');

const MAX_MESSAGE_LENGTH = 2000;
const THREAD_THRESHOLD_MESSAGES = 3;
const THREAD_THRESHOLD_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface ConversationTracker {
  channelId: string;
  messageCount: number;
  firstMessageTime: number;
  threadId?: string;
}

/**
 * AgentDiscordRouter - Routes messages between agents and Discord
 *
 * Listens for routed Discord messages, processes them via agent simpleQuery,
 * and posts responses back to the same channel. Handles:
 * - Message splitting for long responses (>2000 chars)
 * - Thread creation for extended conversations (>3 exchanges in 5 minutes)
 * - Error handling to prevent bot crashes
 */
export class AgentDiscordRouter {
  private conversations = new Map<string, ConversationTracker>();
  private unsubscribe?: () => void;

  constructor(
    private events: EventEmitter,
    private discordBot: DiscordBotService
  ) {}

  /**
   * Start listening for routed Discord messages
   */
  start(): void {
    logger.info('Starting AgentDiscordRouter');

    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'discord:user-message:routed') {
        this.handleRoutedMessage(payload as DiscordUserMessageRoutedPayload).catch((error) => {
          logger.error('Error handling routed message:', error);
        });
      }
    });

    logger.info('AgentDiscordRouter started, listening for discord:user-message:routed events');
  }

  /**
   * Stop listening for messages
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.conversations.clear();
    logger.info('AgentDiscordRouter stopped');
  }

  /**
   * Handle a routed Discord message
   */
  private async handleRoutedMessage(payload: DiscordUserMessageRoutedPayload): Promise<void> {
    const { channelId, userId, content, username, routedToAgent } = payload;

    logger.info(
      `Processing message from ${username} (${userId}) in channel ${channelId} for agent ${routedToAgent}`
    );

    try {
      // Process the message via simpleQuery
      const response = await this.processMessage(content, routedToAgent, username);

      if (!response || response.trim().length === 0) {
        logger.warn('Agent returned empty response, skipping Discord message');
        return;
      }

      // Track conversation and check if we need a thread
      const tracker = this.trackConversation(channelId);
      const shouldUseThread = this.shouldCreateThread(tracker);

      // If we should use a thread but don't have one, create it
      if (shouldUseThread && !tracker.threadId) {
        tracker.threadId = await this.createThread(channelId, content);
      }

      // Send response (with message splitting if needed)
      await this.sendResponse(channelId, response, tracker.threadId);

      logger.info(
        `Response sent to channel ${channelId}${tracker.threadId ? ` (thread ${tracker.threadId})` : ''}`
      );
    } catch (error) {
      const { message, type } = classifyError(error);
      logger.error(`Failed to process message for agent ${routedToAgent}:`, { message, type });

      // Send error message to Discord (but don't crash)
      try {
        await this.discordBot.sendToChannel(
          channelId,
          `Sorry, I encountered an error processing your message: ${message}`
        );
      } catch (sendError) {
        logger.error('Failed to send error message to Discord:', sendError);
      }
    }
  }

  /**
   * Process a message via agent simpleQuery
   */
  private async processMessage(
    content: string,
    agentName: string,
    username: string
  ): Promise<string> {
    logger.debug(`Querying agent ${agentName} with message from ${username}`);

    // Use simpleQuery to get agent response
    const result = await simpleQuery({
      prompt: content,
      systemPrompt: `You are ${agentName}. Responding to Discord user ${username}. Keep responses concise and helpful.`,
      cwd: process.cwd(),
    });

    return result.text;
  }

  /**
   * Track conversation for thread creation logic
   */
  private trackConversation(channelId: string): ConversationTracker {
    const now = Date.now();
    let tracker = this.conversations.get(channelId);

    if (!tracker) {
      // New conversation
      tracker = {
        channelId,
        messageCount: 1,
        firstMessageTime: now,
      };
      this.conversations.set(channelId, tracker);
    } else {
      // Check if conversation is still within window
      if (now - tracker.firstMessageTime > THREAD_THRESHOLD_WINDOW_MS) {
        // Reset conversation tracking (window expired)
        tracker.messageCount = 1;
        tracker.firstMessageTime = now;
        tracker.threadId = undefined;
      } else {
        // Increment message count
        tracker.messageCount++;
      }
    }

    return tracker;
  }

  /**
   * Check if we should create a thread for this conversation
   */
  private shouldCreateThread(tracker: ConversationTracker): boolean {
    return tracker.messageCount >= THREAD_THRESHOLD_MESSAGES;
  }

  /**
   * Create a Discord thread for an extended conversation
   */
  private async createThread(channelId: string, firstMessage: string): Promise<string> {
    try {
      // Get the latest message ID to create a thread from
      const messages = await this.discordBot.readMessages(channelId, 1);
      if (messages.length === 0) {
        throw new Error('No messages found to create thread from');
      }

      const messageId = messages[0].id;
      const threadName = firstMessage.slice(0, 100); // Discord thread name limit

      logger.info(`Creating thread in channel ${channelId} from message ${messageId}`);

      const threadId = await this.discordBot.createThread(channelId, messageId, threadName);
      return threadId || ''; // Return empty string if thread creation failed
    } catch (error) {
      logger.error('Failed to create thread:', error);
      return ''; // Return empty string on failure
    }
  }

  /**
   * Send response to Discord, splitting if needed
   */
  private async sendResponse(
    channelId: string,
    response: string,
    threadId?: string
  ): Promise<void> {
    const targetChannel = threadId || channelId;

    // If response is short enough, send it directly
    if (response.length <= MAX_MESSAGE_LENGTH) {
      await this.discordBot.sendToChannel(targetChannel, response);
      return;
    }

    // Split long response into multiple messages
    const chunks = this.splitMessage(response);
    logger.info(`Splitting long response into ${chunks.length} messages`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const prefix = chunks.length > 1 ? `[${i + 1}/${chunks.length}] ` : '';
      await this.discordBot.sendToChannel(targetChannel, prefix + chunk);

      // Small delay between messages to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  /**
   * Split a message into chunks that fit Discord's character limit
   */
  private splitMessage(message: string): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    // Split by lines to avoid breaking mid-sentence
    const lines = message.split('\n');

    for (const line of lines) {
      // If a single line is too long, split it by words
      if (line.length > MAX_MESSAGE_LENGTH) {
        const words = line.split(' ');
        for (const word of words) {
          if (currentChunk.length + word.length + 1 > MAX_MESSAGE_LENGTH) {
            chunks.push(currentChunk.trim());
            currentChunk = word;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + word;
          }
        }
      } else if (currentChunk.length + line.length + 1 > MAX_MESSAGE_LENGTH) {
        // Current chunk + this line would be too long
        chunks.push(currentChunk.trim());
        currentChunk = line;
      } else {
        // Add line to current chunk
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
