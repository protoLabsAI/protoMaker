/**
 * Agent Discord Router Service
 *
 * Manages agent-to-Discord response mapping. Receives 'discord:user-message:routed' events,
 * processes them via simpleQuery, and sends responses back to Discord. Handles message
 * splitting for long responses and thread creation for extended conversations.
 *
 * Uses RoleRegistryService for template-based role resolution with fallback to
 * hardcoded prompts for backward compatibility.
 */

import type { EventEmitter } from '../lib/events.js';
import type { DiscordUserMessageRoutedPayload, AgentRole } from '@protolabsai/types';
import { createLogger, classifyError } from '@protolabsai/utils';
import { DiscordBotService } from './discord-bot-service.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import { ROLE_CAPABILITIES } from '@protolabsai/types';
import {
  getProductManagerPrompt,
  getEngineeringManagerPrompt,
  getFrontendEngineerPrompt,
  getBackendEngineerPrompt,
  getDevOpsEngineerPrompt,
  getQAEngineerPrompt,
  getDocsEngineerPrompt,
} from '@protolabsai/prompts';
import type { RoleRegistryService } from './role-registry-service.js';

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
 * - Registry-based role resolution with hardcoded fallback
 */
export class AgentDiscordRouter {
  private conversations = new Map<string, ConversationTracker>();
  private unsubscribe?: () => void;
  private roleRegistry?: RoleRegistryService;

  constructor(
    private events: EventEmitter,
    private discordBot: DiscordBotService,
    roleRegistry?: RoleRegistryService
  ) {
    this.roleRegistry = roleRegistry;
  }

  /**
   * Start listening for routed Discord messages
   */
  start(): void {
    logger.info('Starting AgentDiscordRouter');

    // TODO: migrate to bus.on()
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
   * Get the appropriate system prompt for a given agent.
   * Checks registry by name, then by role, then hardcoded prompts.
   * Throws if no prompt can be resolved — never returns a generic fallback.
   */
  private getRolePrompt(agentName: string, _username: string): string {
    const projectPath = process.cwd();

    // Try registry first — resolve by name or role
    if (this.roleRegistry) {
      const template = this.roleRegistry.resolve(agentName);
      if (template?.systemPrompt) {
        logger.debug(
          `Using registry template prompt for "${agentName}" (template: ${template.name})`
        );
        return template.systemPrompt;
      }
    }

    // Fall back to hardcoded prompts for known roles
    switch (agentName) {
      case 'product-manager':
        return getProductManagerPrompt({ projectPath, discordChannels: [], contextFiles: [] });
      case 'engineering-manager':
        return getEngineeringManagerPrompt({ projectPath, contextFiles: [] });
      case 'frontend-engineer':
        return getFrontendEngineerPrompt({ projectPath, contextFiles: [] });
      case 'backend-engineer':
        return getBackendEngineerPrompt({ projectPath, contextFiles: [] });
      case 'devops-engineer':
        return getDevOpsEngineerPrompt({ projectPath, contextFiles: [] });
      case 'qa-engineer':
        return getQAEngineerPrompt({ projectPath, contextFiles: [] });
      case 'docs-engineer':
        return getDocsEngineerPrompt({ projectPath, contextFiles: [] });
      default:
        throw new Error(
          `No prompt found for agent "${agentName}". Agent is not registered or has no system prompt configured.`
        );
    }
  }

  /**
   * Get the allowed tools for a given agent.
   * Checks registry by name, then by role, then ROLE_CAPABILITIES.
   * Throws if no tools can be resolved — never defaults to unrestricted access.
   */
  private getRoleTools(agentName: string): string[] {
    // Try registry first — resolve by name or role
    const template = this.roleRegistry?.resolve(agentName);
    if (template?.tools) {
      logger.debug(`Using registry template tools for "${agentName}" (template: ${template.name})`);
      return template.tools;
    }
    // Template found but no explicit tools — use ROLE_CAPABILITIES by template's role
    if (template) {
      const capabilities = ROLE_CAPABILITIES[template.role as AgentRole];
      if (capabilities) {
        logger.debug(`Using ROLE_CAPABILITIES for "${agentName}" via role "${template.role}"`);
        return capabilities.tools;
      }
    }

    // Only try ROLE_CAPABILITIES directly when no template was found
    if (!template) {
      const capabilities = ROLE_CAPABILITIES[agentName as AgentRole];
      if (capabilities) {
        return capabilities.tools;
      }
    }

    throw new Error(
      `No tools configuration found for agent "${agentName}". Refusing to proceed with unrestricted permissions.`
    );
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
      // Track conversation and check if we need a thread
      const tracker = this.trackConversation(channelId);
      const shouldUseThread = this.shouldCreateThread(tracker);

      // If we should use a thread but don't have one, create it
      if (shouldUseThread && !tracker.threadId) {
        tracker.threadId = await this.createThread(channelId, content);
      }

      // Process the message via simpleQuery, passing thread ID for conversation history
      const response = await this.processMessage(
        content,
        routedToAgent,
        username,
        tracker.threadId
      );

      if (!response || response.trim().length === 0) {
        logger.warn('Agent returned empty response, skipping Discord message');
        return;
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
    username: string,
    threadId?: string
  ): Promise<string> {
    logger.debug(`Querying agent ${agentName} with message from ${username}`);

    // Get role-specific system prompt and tools (throws if agent not found)
    let systemPrompt = this.getRolePrompt(agentName, username);
    const allowedTools = this.getRoleTools(agentName);

    // Load conversation history if in a thread and include it in the system prompt
    if (threadId) {
      try {
        // Fetch messages from the thread
        const messages = await this.discordBot.readMessages(threadId, 50);

        if (messages.length > 0) {
          // Convert Discord messages to conversation history
          // Messages are returned newest first, so reverse them
          const conversationHistory: string[] = [];
          messages.reverse().forEach((msg) => {
            const role = msg.author.bot ? 'Assistant' : msg.author.username;
            conversationHistory.push(`${role}: ${msg.content}`);
          });

          // Append conversation history to system prompt
          systemPrompt += `\n\n## Conversation History\n\nHere is the conversation so far:\n\n${conversationHistory.join('\n\n')}`;

          logger.debug(`Loaded ${messages.length} messages from thread ${threadId}`);
        }
      } catch (error) {
        logger.warn(`Failed to load thread history: ${error}`);
        // Continue without history if loading fails
      }
    }

    // Use simpleQuery to get agent response
    // Pass allowedTools directly — empty array means no tools, undefined means unrestricted.
    // We always have an explicit tools list here (getRoleTools throws if it can't resolve one).
    const result = await simpleQuery({
      prompt: content,
      systemPrompt,
      cwd: process.cwd(),
      allowedTools,
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
