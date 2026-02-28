/**
 * Discord Bot Service - Connects to Discord for passive channel monitoring
 *
 * Provides message and reaction-based signal ingestion from Discord. Supports:
 *
 * - Message prefix command (`!idea`) for injecting ideas
 * - Thread-based review: PM feedback posted in a review thread
 * - CTO response loop: CTO replies in thread to approve or revise
 * - Reaction-based gate resolution and approval flows
 * - Milestone notifications: updates when milestones start/complete
 *
 * Setup:
 * 1. Set DISCORD_BOT_TOKEN in .env or environment
 * 2. Invite bot to server with scopes: bot
 * 3. Bot permissions: Send Messages, Read Message History, Add Reactions,
 *    Manage Messages, Create Public Threads
 *
 * The service is optional - if no token is configured, it logs a warning
 * and the rest of the server operates normally.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  type Attachment,
  type Message,
  type TextChannel,
  type ThreadChannel,
  Events,
} from 'discord.js';
import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { AuthorityService } from './authority-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { PMAuthorityAgent } from './authority-agents/pm-agent.js';
import type { ProjMAuthorityAgent } from './authority-agents/projm-agent.js';
import type { EMAuthorityAgent } from './authority-agents/em-agent.js';
import type { SettingsService } from './settings-service.js';

interface AuthorityAgents {
  pm?: PMAuthorityAgent;
  projm?: ProjMAuthorityAgent;
  em?: EMAuthorityAgent;
}
import * as https from 'node:https';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

const logger = createLogger('DiscordBot');

/** Channel IDs — configured via environment variables */
const CHANNELS = {
  suggestions: process.env.DISCORD_CHANNEL_SUGGESTIONS || '',
  projectPlanning: process.env.DISCORD_CHANNEL_PROJECT_PLANNING || '',
  agentLogs: process.env.DISCORD_CHANNEL_AGENT_LOGS || '',
  codeReview: process.env.DISCORD_CHANNEL_CODE_REVIEW || '',
} as const;

/** Guild ID — configured via environment variable */
const GUILD_ID = process.env.DISCORD_GUILD_ID || '';

/** Message prefix alternative to slash command */
const IDEA_PREFIX = '!idea ';

/** Pending ideas waiting for PM review, keyed by featureId */
interface PendingIdea {
  channelId: string;
  interactionToken?: string;
  messageId?: string;
  threadId?: string;
  userId: string;
  title: string;
  createdAt: number;
}

export class DiscordBotService {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;
  private readonly settingsService: SettingsService;
  private readonly projectPath: string;
  private readonly agents?: AuthorityAgents;

  private client: Client | null = null;
  private initialized = false;

  /** Track pending ideas to post review results back */
  private pendingIdeas = new Map<string, PendingIdea>();

  /** Track approval messages to map reactions to feature IDs */
  private approvalMessages = new Map<string, { featureId: string; projectPath: string }>();

  /** Map thread IDs to feature IDs for CTO reply handling */
  private reviewThreads = new Map<string, string>();

  /** Map Discord user IDs to their assigned AI agents for message routing */
  private userRouting: Map<string, { agentId: string; enabled: boolean }> = new Map();

  /** Message debounce buffer to batch rapid messages from the same user */
  private messageBuffer: Map<string, { messages: Message[]; timer: NodeJS.Timeout }> = new Map();

  /**
   * Pending gate hold messages for the signal-aware channel router.
   * Keyed by Discord messageId → gate context.
   */
  private pendingGateMessages = new Map<
    string,
    { featureId: string; projectPath: string; channelId: string }
  >();

  /** Reverse lookup: featureId → Discord messageId for editing/cancelling */
  private gateMessagesByFeature = new Map<string, string>();

  /**
   * Registered callback to resolve a pipeline gate when a Discord reaction fires.
   * Set by wiring.ts after PipelineOrchestrator is available.
   */
  private gateResolver?: (
    featureId: string,
    projectPath: string,
    action: 'advance' | 'reject'
  ) => Promise<void>;

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader,
    settingsService: SettingsService,
    projectPath: string,
    agents?: AuthorityAgents
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;
    this.settingsService = settingsService;
    this.projectPath = projectPath;
    this.agents = agents;
  }

  /**
   * Register the gate resolver callback used when ✅/❌ reactions arrive on
   * gate-hold messages posted by DiscordChannelHandler.
   */
  setGateResolver(
    fn: (featureId: string, projectPath: string, action: 'advance' | 'reject') => Promise<void>
  ): void {
    this.gateResolver = fn;
  }

  /**
   * Post a gate-hold message to a Discord channel with ✅/❌ reaction instructions.
   * Registers the message in the pending gate map so handleReaction() can resolve it.
   * Returns the Discord messageId, or null on failure.
   */
  async postGateHoldMessage(
    channelId: string,
    featureId: string,
    projectPath: string,
    featureTitle?: string,
    phase?: string
  ): Promise<string | null> {
    if (!this.client) return null;
    try {
      const channel = (await this.client.channels.fetch(channelId)) as TextChannel;
      if (!channel?.isTextBased()) return null;

      const phaseStr = phase ? ` at \`${phase}\` phase` : '';
      const content = [
        `🚦 **Gate Hold** — Approval required to proceed${phaseStr}.`,
        `**Feature:** ${featureTitle || featureId}`,
        `React with ✅ to **advance** or ❌ to **reject**.`,
      ].join('\n');

      const msg = await channel.send(content);
      await msg.react('✅');
      await msg.react('❌');

      this.pendingGateMessages.set(msg.id, { featureId, projectPath, channelId });
      this.gateMessagesByFeature.set(featureId, msg.id);

      return msg.id;
    } catch (error) {
      logger.error(`Failed to post gate hold message for feature ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Edit the gate-hold message for a feature (e.g., to show resolved status).
   */
  async editGateMessage(featureId: string, content: string): Promise<void> {
    if (!this.client) return;
    const messageId = this.gateMessagesByFeature.get(featureId);
    if (!messageId) return;

    const gate = this.pendingGateMessages.get(messageId);
    if (!gate) return;

    try {
      const channel = (await this.client.channels.fetch(gate.channelId)) as TextChannel;
      if (!channel?.isTextBased()) return;
      const msg = await channel.messages.fetch(messageId);
      await msg.edit(content);
    } catch (error) {
      logger.warn(`Failed to edit gate message for feature ${featureId}:`, error);
    }
  }

  /** Get the Discord messageId of a pending gate message for a feature. */
  getGateMessageId(featureId: string): string | undefined {
    return this.gateMessagesByFeature.get(featureId);
  }

  /** Get the channel ID where the gate message was posted for a feature. */
  getGateMessageChannelId(featureId: string): string | undefined {
    const messageId = this.gateMessagesByFeature.get(featureId);
    if (!messageId) return undefined;
    return this.pendingGateMessages.get(messageId)?.channelId;
  }

  /**
   * Wait for the first non-bot message in a channel/thread.
   * Used by DiscordChannelHandler.sendHITLForm() to capture form responses.
   * Returns the message content or null on timeout.
   */
  waitForReply(channelId: string, timeoutMs: number = 5 * 60 * 1000): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve(null);
        return;
      }

      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.client?.off(Events.MessageCreate, handler);
        resolve(null);
      }, timeoutMs);

      const handler = (message: Message) => {
        if (message.channelId === channelId && !message.author.bot) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.client?.off(Events.MessageCreate, handler);
          resolve(message.content);
        }
      };

      this.client.on(Events.MessageCreate, handler);
    });
  }

  /**
   * Initialize the Discord bot. Requires DISCORD_BOT_TOKEN in environment.
   * Returns false if token is not configured (non-fatal).
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      logger.info('DISCORD_BOT_TOKEN not set - Discord bot features disabled');
      logger.info('Set DISCORD_BOT_TOKEN in .env to enable /idea command in Discord');
      return false;
    }

    try {
      // Create Discord client with necessary intents
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageReactions,
          GatewayIntentBits.DirectMessages,
        ],
        partials: [Partials.Channel],
      });

      // Set up event handlers
      this.client.once(Events.ClientReady, (readyClient) => {
        logger.info(`Discord bot connected as ${readyClient.user.tag}`);
      });

      this.client.on(Events.MessageCreate, (message) => {
        void this.handleMessage(message);
      });

      this.client.on(Events.MessageReactionAdd, (reaction, user) => {
        if (user.bot) return;
        void this.handleReaction(reaction.message.id, reaction.emoji.name || '', user.id, true);
      });

      // Listen for PM agent review events
      this.listenForAgentEvents();

      // Connect to Discord
      await this.client.login(token);
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize Discord bot:', error);
      this.client = null;
      return false;
    }
  }

  /**
   * Build a complete DiscordRoutedMessage payload with context.
   */
  private async buildRoutedMessage(
    message: Message,
    userId: string,
    agentType: string,
    enabled: boolean
  ): Promise<{
    message: {
      id: string;
      channelId: string;
      authorId: string;
      authorName: string;
      content: string;
      timestamp: string;
    };
    recentMessages: Array<{
      id: string;
      channelId: string;
      authorId: string;
      authorName: string;
      content: string;
      timestamp: string;
    }>;
    attachments: {
      textFiles?: Array<{ filename: string; content: string }>;
      imagePaths?: string[];
    };
    replyTo?: {
      messageId: string;
      authorId: string;
      authorName: string;
      content: string;
      timestamp: string;
    };
    routingConfig: { userId: string; agentType: string; enabled: boolean };
  }> {
    // 1. Convert message to simple object
    const messageData = {
      id: message.id,
      channelId: message.channelId,
      authorId: message.author.id,
      authorName: message.author.username,
      content: message.content,
      timestamp: message.createdAt.toISOString(),
    };

    // 2. Fetch recent messages for conversational context
    const recentMessages = await this.fetchRecentMessages(message.channelId, 10);

    // 3. Process attachments on the triggering message
    let attachments: {
      textFiles?: Array<{ filename: string; content: string }>;
      imagePaths?: string[];
    } = {};
    if (message.attachments.size > 0) {
      for (const attachment of message.attachments.values()) {
        const processed = await this.processAttachment(attachment);
        if (processed.textFiles) {
          attachments.textFiles = [...(attachments.textFiles || []), ...processed.textFiles];
        }
        if (processed.imagePaths) {
          attachments.imagePaths = [...(attachments.imagePaths || []), ...processed.imagePaths];
        }
      }
    }

    // 4. Get reply context if message is a reply
    const replyTo = await this.getReplyContext(message);

    return {
      message: messageData,
      recentMessages,
      attachments,
      replyTo,
      routingConfig: {
        userId,
        agentType,
        enabled,
      },
    };
  }

  /**
   * Handle message-prefix commands and thread replies.
   */
  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    const content = message.content.trim();

    // Handle DMs - must check BEFORE guild-based handlers (DMs have no guild context)
    if (message.channel.type === ChannelType.DM) {
      await this.handleDM(message);
      return;
    }

    // Handle CTO replies in review threads
    if (message.channel.isThread()) {
      const featureId = this.reviewThreads.get(message.channelId);
      if (featureId) {
        await this.handleThreadReply(message, featureId);
        return;
      }
    }

    // Handle !idea prefix command
    if (content.startsWith(IDEA_PREFIX)) {
      await this.handleBangIdeaCommand(message, content);
      return;
    }

    // Route messages from mapped Discord users to their assigned AI agents (fallback handler)
    const routing = this.userRouting.get(message.author.id);
    if (routing?.enabled) {
      await this.bufferAndRouteMessage(message, routing.agentId);
    }
  }

  /**
   * Get Discord integration config from settings.
   */
  private async getConfig() {
    const settings = await this.settingsService.getProjectSettings(this.projectPath);
    return settings?.integrations?.discord;
  }

  /**
   * Handle DM messages from mapped users.
   * Emits `discord:dm:received` event for routed users.
   */
  private async handleDM(message: Message): Promise<void> {
    try {
      const username = message.author.username;

      // Check if this user is mapped in userRouting
      const config = await this.getConfig();
      if (!config?.userRouting) {
        logger.debug(`DM from ${username} but no userRouting configured`);
        return;
      }

      // userRouting is a Record<string, { agentType: string; enabled: boolean }>
      // where the key is the Discord username
      const routingInfo = config.userRouting[username];
      if (!routingInfo || !routingInfo.enabled) {
        logger.debug(`DM from ${username} but not in userRouting map or disabled`);
        return;
      }

      // Extract attachments
      const attachments = message.attachments.map((att) => ({
        id: att.id,
        name: att.name ?? 'unknown',
        url: att.url,
        contentType: att.contentType ?? undefined,
        size: att.size,
      }));

      // Emit discord:dm:received event
      this.events.emit('discord:dm:received', {
        username,
        content: message.content,
        attachments,
        timestamp: Date.now(),
      });

      logger.info(`DM received from routed user: ${username}`);
    } catch (error) {
      logger.error('Error handling DM:', error);
    }
  }

  /**
   * Handle CTO reply in a review thread.
   * If the reply contains "approve" or "lgtm", treat as approval.
   * Otherwise, treat as updated description/feedback for PM re-review.
   */
  private async handleThreadReply(message: Message, featureId: string): Promise<void> {
    const content = message.content.trim();
    const lower = content.toLowerCase();

    // Check for approval keywords
    const isApproval =
      /^(approve[d]?|lgtm|looks good|ship it|go ahead|approved?)$/i.test(lower) ||
      lower.startsWith('approve');

    if (isApproval) {
      // CTO approves - emit event for PM agent
      this.events.emit('authority:cto-approved-idea', {
        projectPath: this.projectPath,
        featureId,
        approvedBy: `discord:${message.author.id}`,
      });

      await message.reply(
        'Approved! PM agent will proceed with project creation and decomposition.'
      );
      logger.info(`CTO approved idea ${featureId} via thread reply`);
    } else {
      // CTO provided updated description/feedback - emit for PM re-review
      this.events.emit('authority:cto-approved-idea', {
        projectPath: this.projectPath,
        featureId,
        updatedDescription: content,
        approvedBy: `discord:${message.author.id}`,
      });

      await message.reply('Got it. PM agent will re-review with your updates.');
      logger.info(`CTO provided feedback for ${featureId} via thread reply`);
    }
  }

  /**
   * Handle !idea prefix command with attachment support.
   */
  private async handleBangIdeaCommand(message: Message, content: string): Promise<void> {
    const ideaText = content.slice(IDEA_PREFIX.length).trim();
    if (!ideaText) {
      await message.reply('Usage: `!idea <title> | <description>` or `!idea <title>`');
      return;
    }

    // Parse title and optional description separated by |
    const [title, ...descParts] = ideaText.split('|');
    const description = descParts.join('|').trim();

    // Process any message attachments
    let attachmentData: {
      textFiles?: Array<{ filename: string; content: string }>;
      imagePaths?: string[];
    } = {};
    if (message.attachments.size > 0) {
      const firstAttachment = message.attachments.first()!;
      attachmentData = await this.processAttachment(firstAttachment);
    }

    try {
      const result = await this.injectIdea(
        title.trim(),
        description,
        message.author.id,
        attachmentData.textFiles,
        attachmentData.imagePaths
      );

      if (result.success) {
        const reply = await message.reply(
          `**Idea submitted:** "${title.trim()}"\n` +
            `**Feature ID:** \`${result.featureId}\`\n` +
            `PM agent is reviewing...`
        );

        // Create a review thread
        let thread: ThreadChannel | null = null;
        try {
          const channel = message.channel as TextChannel;
          thread = await channel.threads.create({
            name: `Review: ${title.trim().slice(0, 90)}`,
            autoArchiveDuration: 1440,
            type: ChannelType.PublicThread,
            startMessage: reply.id,
          });

          await thread.send(
            `**PM Review Thread**\n` +
              `Reply here to provide feedback or approve changes.\n` +
              `<@${message.author.id}>`
          );
        } catch (threadError) {
          logger.warn('Could not create review thread for !idea:', threadError);
        }

        this.pendingIdeas.set(result.featureId!, {
          channelId: message.channelId,
          messageId: reply.id,
          threadId: thread?.id,
          userId: message.author.id,
          title: title.trim(),
          createdAt: Date.now(),
        });

        if (thread) {
          this.reviewThreads.set(thread.id, result.featureId!);
        }
      } else {
        await message.reply(`Failed: ${result.error}`);
      }
    } catch (error) {
      logger.error('Error handling !idea command:', error);
      await message.reply('Error submitting idea.');
    }
  }

  /**
   * Fetch the last N messages from a channel for conversational context.
   */
  private async fetchRecentMessages(
    channelId: string,
    limit: number = 10
  ): Promise<
    Array<{
      id: string;
      channelId: string;
      authorId: string;
      authorName: string;
      content: string;
      timestamp: string;
    }>
  > {
    if (!this.client) return [];

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return [];

      const messages = await (channel as TextChannel).messages.fetch({ limit });

      return Array.from(messages.values())
        .map((msg) => ({
          id: msg.id,
          channelId: msg.channelId,
          authorId: msg.author.id,
          authorName: msg.author.username,
          content: msg.content,
          timestamp: msg.createdAt.toISOString(),
        }))
        .reverse(); // oldest to newest
    } catch (error) {
      logger.warn(`Failed to fetch recent messages from channel ${channelId}:`, error);
      return [];
    }
  }

  /**
   * Get reply context if the message is replying to another message.
   */
  private async getReplyContext(message: Message): Promise<
    | {
        messageId: string;
        authorId: string;
        authorName: string;
        content: string;
        timestamp: string;
      }
    | undefined
  > {
    if (!message.reference?.messageId) return undefined;

    try {
      const channel = message.channel;
      if (!channel.isTextBased()) return undefined;

      const referencedMessage = await (channel as TextChannel).messages.fetch(
        message.reference.messageId
      );
      if (!referencedMessage) return undefined;

      return {
        messageId: referencedMessage.id,
        authorId: referencedMessage.author.id,
        authorName: referencedMessage.author.username,
        content: referencedMessage.content,
        timestamp: referencedMessage.createdAt.toISOString(),
      };
    } catch (error) {
      logger.warn(`Failed to fetch reply context for message ${message.id}:`, error);
      return undefined;
    }
  }

  /**
   * Buffer and route messages from Discord users to their assigned AI agents.
   * Uses a 3-second debounce to batch rapid messages together.
   * Buffer keys are scoped by userId:channelId to prevent cross-channel mixing.
   */
  private async bufferAndRouteMessage(message: Message, agentId: string): Promise<void> {
    const userId = message.author.id;
    const bufferKey = `${userId}:${message.channelId}`;

    // Get or create buffer entry
    let bufferEntry = this.messageBuffer.get(bufferKey);

    if (bufferEntry) {
      // Clear existing timer and add message to buffer
      clearTimeout(bufferEntry.timer);
      bufferEntry.messages.push(message);
    } else {
      // Create new buffer entry
      bufferEntry = {
        messages: [message],
        timer: setTimeout(() => {}, 0), // Placeholder, will be replaced below
      };
      this.messageBuffer.set(bufferKey, bufferEntry);
    }

    // Set 3-second debounce timer
    bufferEntry.timer = setTimeout(() => {
      void (async () => {
        const entry = this.messageBuffer.get(bufferKey);
        if (!entry) return;

        // Remove from buffer
        this.messageBuffer.delete(bufferKey);

        try {
          // Process all buffered messages
          const messages = await Promise.all(
            entry.messages.map(async (msg) => {
              const attachmentData: {
                textFiles?: Array<{ filename: string; content: string }>;
                imagePaths?: string[];
              } = {};

              // Process all attachments
              if (msg.attachments.size > 0) {
                for (const attachment of msg.attachments.values()) {
                  const processed = await this.processAttachment(attachment);
                  if (processed.textFiles) {
                    attachmentData.textFiles = [
                      ...(attachmentData.textFiles || []),
                      ...processed.textFiles,
                    ];
                  }
                  if (processed.imagePaths) {
                    attachmentData.imagePaths = [
                      ...(attachmentData.imagePaths || []),
                      ...processed.imagePaths,
                    ];
                  }
                }
              }

              return {
                content: msg.content,
                attachments: attachmentData,
                timestamp: msg.createdTimestamp,
              };
            })
          );

          // Emit routed message event
          this.events.emit('discord:user-message:routed', {
            projectPath: this.projectPath,
            userId,
            username: message.author.username,
            agentId,
            messages,
            channelId: entry.messages[0].channelId,
          });

          logger.info(
            `Routed ${messages.length} message(s) from ${userId} (${message.author.username}) to agent ${agentId}`
          );
        } catch (error) {
          logger.error(
            `Failed to route buffered messages for ${userId} (${message.author.username}):`,
            error
          );
        }
      })();
    }, 3000);
  }

  /**
   * Process a Discord attachment: download and categorize as text or image.
   */
  private async processAttachment(
    attachment: Attachment
  ): Promise<{ textFiles?: Array<{ filename: string; content: string }>; imagePaths?: string[] }> {
    const result: {
      textFiles?: Array<{ filename: string; content: string }>;
      imagePaths?: string[];
    } = {};

    if (!attachment.url || !attachment.name) return result;

    const filename = attachment.name;
    const url = attachment.url;
    const contentType = attachment.contentType || '';

    try {
      const isText = /\.(txt|md|markdown|text)$/i.test(filename) || contentType.startsWith('text/');
      const isImage =
        /\.(png|jpg|jpeg|gif|webp)$/i.test(filename) || contentType.startsWith('image/');

      if (isText) {
        const content = await this.downloadAsText(url);
        result.textFiles = [{ filename, content }];
      } else if (isImage) {
        // Save image to a temp path for the feature
        const tmpDir = path.join(this.projectPath, '.automaker', 'tmp');
        await fs.promises.mkdir(tmpDir, { recursive: true });
        const tmpPath = path.join(tmpDir, `discord-${Date.now()}-${filename}`);
        await this.downloadToFile(url, tmpPath);
        result.imagePaths = [tmpPath];
      }
    } catch (error) {
      logger.error(`Failed to process attachment ${filename}:`, error);
    }

    return result;
  }

  /**
   * Download a URL as text content.
   */
  private downloadAsText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client
        .get(url, (res) => {
          // Follow redirects
          if (res.statusCode === 301 || res.statusCode === 302) {
            if (res.headers.location) {
              this.downloadAsText(res.headers.location).then(resolve, reject);
              return;
            }
          }
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => resolve(data));
          res.on('error', reject);
        })
        .on('error', reject);
    });
  }

  /**
   * Download a URL to a file path.
   */
  private downloadToFile(url: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client
        .get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            if (res.headers.location) {
              this.downloadToFile(res.headers.location, filePath).then(resolve, reject);
              return;
            }
          }
          const ws = fs.createWriteStream(filePath);
          res.pipe(ws);
          ws.on('finish', () => {
            ws.close();
            resolve();
          });
          ws.on('error', reject);
        })
        .on('error', reject);
    });
  }

  /**
   * Inject an idea through the authority system with optional attachments.
   */
  private async injectIdea(
    title: string,
    description: string,
    userId: string,
    textFiles?: Array<{ filename: string; content: string }>,
    imagePaths?: string[]
  ): Promise<{ success: boolean; featureId?: string; error?: string }> {
    try {
      // Build text file paths for the feature
      const textFilePaths = textFiles?.map((tf, i) => ({
        id: `discord-${Date.now()}-${i}`,
        path: `inline:${tf.filename}`,
        filename: tf.filename,
        mimeType: 'text/plain',
        content: tf.content,
      }));

      // Ensure authority agents are initialized for this project
      // so the PM agent picks up the idea-injected event
      if (this.agents?.pm) await this.agents.pm.initialize(this.projectPath);
      if (this.agents?.projm) await this.agents.projm.initialize(this.projectPath);
      if (this.agents?.em) await this.agents.em.initialize(this.projectPath);

      // Create feature in 'idea' state via the inject-idea pipeline
      const feature = await this.featureLoader.create(this.projectPath, {
        title,
        description: description || title,
        status: 'backlog',
        workItemState: 'idea',
        category: 'Authority Ideas',
        ...(textFilePaths?.length ? { textFilePaths } : {}),
        ...(imagePaths?.length ? { imagePaths } : {}),
      });

      // Emit the idea-injected event for PM agent to pick up
      this.events.emit('authority:idea-injected', {
        projectPath: this.projectPath,
        featureId: feature.id,
        title,
        description: description || title,
        injectedBy: `discord:${userId}`,
        injectedAt: new Date().toISOString(),
      });

      logger.info(`Idea injected via Discord: "${title}" (${feature.id}) by user ${userId}`);
      return { success: true, featureId: feature.id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to inject idea "${title}":`, error);
      return { success: false, error: msg };
    }
  }

  /**
   * Listen for PM agent review events and milestone events.
   */
  private listenForAgentEvents(): void {
    this.events.subscribe((type, payload) => {
      const data = payload as Record<string, unknown>;

      // PM review approved - post to thread
      if (type === 'authority:pm-review-approved') {
        const featureId = data.featureId as string;
        if (featureId) {
          void this.postReviewResult(featureId, 'approved', data);
        }
      }

      // PM review changes requested - post to thread
      if (type === 'authority:pm-review-changes-requested') {
        const featureId = data.featureId as string;
        if (featureId) {
          void this.postReviewResult(featureId, 'changes_requested', data);
        }
      }

      // PM review started - post to thread
      if (type === 'authority:pm-review-started') {
        const featureId = data.featureId as string;
        if (featureId) {
          void this.postReviewStarted(featureId);
        }
      }

      // PM research started - post to thread
      if (type === 'authority:pm-research-started') {
        const featureId = data.featureId as string;
        if (featureId) {
          void this.postResearchStarted(featureId);
        }
      }

      // PM PRD ready - post PRD to thread for review
      if (type === 'authority:pm-prd-ready') {
        const featureId = data.featureId as string;
        if (featureId) {
          void this.postPRDReady(featureId, data);
        }
      }

      // Epic created notification
      if (type === 'authority:pm-epic-created') {
        const epicId = data.epicId as string;
        if (epicId && this.pendingIdeas.has(epicId)) {
          void this.postEpicCreated(epicId, data);
        }
      }

      // Milestone events
      if (
        type === 'milestone:completed' ||
        type === 'milestone:planning-started' ||
        type === 'milestone:cto-approval-requested'
      ) {
        void this.postMilestoneEvent(type, data);
      }

      // Post approval requests to Discord
      if (type === 'authority:awaiting-approval') {
        void this.postApprovalRequest(data);
      }
    });
  }

  /**
   * Post "PM is reviewing..." to the review thread.
   */
  private async postReviewStarted(featureId: string): Promise<void> {
    const pending = this.pendingIdeas.get(featureId);
    if (!pending?.threadId || !this.client) return;

    try {
      const thread = (await this.client.channels.fetch(pending.threadId)) as ThreadChannel;
      if (!thread?.isThread()) return;

      await thread.send('**PM agent is reviewing your idea...**\nThis may take a moment.');
    } catch (error) {
      logger.warn(`Failed to post review started for ${featureId}:`, error);
    }
  }

  /**
   * Post "PM is researching the codebase..." to the review thread.
   */
  private async postResearchStarted(featureId: string): Promise<void> {
    const pending = this.pendingIdeas.get(featureId);
    if (!pending?.threadId || !this.client) return;

    try {
      const thread = (await this.client.channels.fetch(pending.threadId)) as ThreadChannel;
      if (!thread?.isThread()) return;

      await thread.send(
        '**PM agent is researching the codebase...**\n' +
          'Exploring project structure, patterns, and relevant code to build a detailed PRD.'
      );
    } catch (error) {
      logger.warn(`Failed to post research started for ${featureId}:`, error);
    }
  }

  /**
   * Post the generated SPARC PRD to the review thread.
   */
  private async postPRDReady(featureId: string, data: Record<string, unknown>): Promise<void> {
    const pending = this.pendingIdeas.get(featureId);
    if (!pending?.threadId || !this.client) return;

    const prd = (data.prd as string) || '';
    const complexity = (data.complexity as string) || 'medium';
    const milestones = (data.milestones as Array<{ title: string }>) || [];

    try {
      const thread = (await this.client.channels.fetch(pending.threadId)) as ThreadChannel;
      if (!thread?.isThread()) return;

      const lines: string[] = [];
      lines.push('**SPARC PRD Generated**');
      lines.push('');
      lines.push(`**Complexity:** ${complexity}`);
      lines.push(`**Milestones:** ${milestones.length}`);
      lines.push('');

      // Truncate PRD for Discord's 2000 char limit (leave safe margin for header/footer)
      const maxPrdLength = 1400;
      const truncatedPrd =
        prd.length > maxPrdLength ? prd.slice(0, maxPrdLength) + '\n...(truncated)' : prd;
      lines.push(truncatedPrd);
      lines.push('');
      lines.push('---');
      lines.push(
        'Reply **approve** to proceed or provide feedback to revise.\n' +
          `Or use \`/approve-idea feature-id:${featureId}\``
      );

      await thread.send(lines.join('\n'));
    } catch (error) {
      logger.warn(`Failed to post PRD ready for ${featureId}:`, error);
    }
  }

  /**
   * Post PM review result to the review thread (or channel if no thread).
   */
  private async postReviewResult(
    featureId: string,
    verdict: 'approved' | 'changes_requested',
    data: Record<string, unknown>
  ): Promise<void> {
    const pending = this.pendingIdeas.get(featureId);
    if (!this.client) return;

    const feedback = (data.feedback as string) || '';
    const complexity = (data.complexity as string) || 'TBD';
    const suggestedDesc = data.suggestedDescription as string;

    try {
      // Try to post in thread, fallback to channel
      let channel: TextChannel | ThreadChannel | null = null;

      if (pending?.threadId) {
        channel = (await this.client.channels.fetch(pending.threadId)) as ThreadChannel;
      }
      if (!channel && pending?.channelId) {
        channel = (await this.client.channels.fetch(pending.channelId)) as TextChannel;
      }
      if (!channel) {
        channel = (await this.client.channels.fetch(CHANNELS.suggestions)) as TextChannel;
      }
      if (!channel?.isTextBased()) return;

      if (verdict === 'approved') {
        const lines: string[] = [];
        lines.push('**PM Review: APPROVED**');
        if (pending?.userId) lines.push(`<@${pending.userId}>`);
        lines.push('');
        lines.push(`**Feedback:** ${feedback}`);
        lines.push(`**Complexity:** ${complexity}`);
        lines.push('');
        lines.push(
          'The ProjM agent will now create a project with milestones and begin execution.'
        );

        const msg = await channel.send(lines.join('\n'));
        await msg.react('🎉');

        // Clean up tracking - idea is now flowing through the pipeline
        if (pending) {
          this.pendingIdeas.delete(featureId);
        }
      } else {
        const lines: string[] = [];
        lines.push('**PM Review: CHANGES REQUESTED**');
        if (pending?.userId) lines.push(`<@${pending.userId}>`);
        lines.push('');
        lines.push(`**Feedback:** ${feedback}`);
        lines.push(`**Complexity:** ${complexity}`);
        lines.push('');

        if (suggestedDesc) {
          const truncated =
            suggestedDesc.length > 800
              ? suggestedDesc.slice(0, 800) + '\n...(truncated)'
              : suggestedDesc;
          lines.push(`**Suggested improvements:**\n${truncated}`);
          lines.push('');
        }

        lines.push(
          '**To approve:** Reply "approve" in this thread or use `/approve-idea feature-id:' +
            featureId +
            '`'
        );
        lines.push('**To revise:** Reply with your updated description and PM will re-review.');

        await channel.send(lines.join('\n'));
      }
    } catch (error) {
      logger.error(`Failed to post review result for ${featureId}:`, error);
    }
  }

  /**
   * Post epic creation notification.
   */
  private async postEpicCreated(epicId: string, data: Record<string, unknown>): Promise<void> {
    const pending = this.pendingIdeas.get(epicId);
    if (!this.client) return;

    try {
      const channelId = pending?.threadId || pending?.channelId || CHANNELS.suggestions;
      const channel = (await this.client.channels.fetch(channelId)) as TextChannel | ThreadChannel;
      if (!channel?.isTextBased()) return;

      const childCount = data.childCount as number;
      await channel.send(
        `**Epic Created:** "${pending?.title || 'Feature'}"\n` +
          `Decomposed into **${childCount}** child features.\n` +
          `The ProjM agent will now set up dependencies and begin milestone-gated execution.`
      );
    } catch (error) {
      logger.error(`Failed to post epic notification for ${epicId}:`, error);
    }
  }

  /**
   * Post milestone lifecycle events to Discord.
   */
  private async postMilestoneEvent(
    eventType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.client) return;

    try {
      const channel = (await this.client.channels.fetch(CHANNELS.projectPlanning)) as TextChannel;
      if (!channel?.isTextBased()) return;

      const milestoneTitle = (data.milestoneTitle as string) || 'Unknown';
      const projectTitle = (data.projectTitle as string) || '';

      if (eventType === 'milestone:completed') {
        await channel.send(
          `**Milestone Complete:** "${milestoneTitle}"${projectTitle ? ` (${projectTitle})` : ''}\n` +
            `All features in this milestone are done. Planning next milestone...`
        );
      } else if (eventType === 'milestone:planning-started') {
        await channel.send(
          `**Planning Milestone:** "${milestoneTitle}"${projectTitle ? ` (${projectTitle})` : ''}\n` +
            `ProjM agent is detailing phases and creating features...`
        );
      } else if (eventType === 'milestone:cto-approval-requested') {
        const plan = (data.plan as string) || '';
        const truncatedPlan = plan.length > 1000 ? plan.slice(0, 1000) + '\n...(truncated)' : plan;

        await channel.send(
          `**Milestone Plan Ready:** "${milestoneTitle}"\n` +
            `${projectTitle ? `**Project:** ${projectTitle}\n` : ''}` +
            `\n${truncatedPlan}\n\n` +
            `React ✅ to approve or ❌ to request changes.`
        );
      }
    } catch (error) {
      logger.error(`Failed to post milestone event ${eventType}:`, error);
    }
  }

  /**
   * Post approval requests to Discord.
   */
  private async postApprovalRequest(data: Record<string, unknown>): Promise<void> {
    if (!this.client) return;

    try {
      const channel = (await this.client.channels.fetch(CHANNELS.projectPlanning)) as TextChannel;
      if (!channel?.isTextBased()) return;

      const proposal = data.proposal as Record<string, unknown>;
      const decision = data.decision as Record<string, unknown>;
      const requestId = data.requestId as string;
      const featureTitle = data.featureTitle as string;

      const riskEmoji: Record<string, string> = {
        low: '🟢',
        medium: '🟡',
        high: '🔴',
        critical: '⛔',
      };

      const risk = proposal?.risk as string;
      const emoji = riskEmoji[risk] || '❓';

      const lines: string[] = [];
      lines.push(`${emoji} **Approval Required**`);
      lines.push(`**Feature:** ${featureTitle || proposal?.target}`);
      lines.push(`**Action:** \`${proposal?.what}\``);
      lines.push(`**Risk:** ${risk}`);
      lines.push(`**Reason:** ${decision?.reason}`);

      if (requestId) {
        lines.push(`\nUse \`/approve id:${requestId}\` or \`/reject id:${requestId}\``);
      }

      await channel.send(lines.join('\n'));
    } catch (error) {
      logger.error('Failed to post approval request to Discord:', error);
    }
  }

  /**
   * Handle reaction-based approval/rejection.
   */
  private async handleReaction(
    messageId: string,
    emoji: string,
    userId: string,
    _added: boolean
  ): Promise<void> {
    // Check pipeline gate hold messages first (signal-aware channel router)
    const gateData = this.pendingGateMessages.get(messageId);
    if (gateData && this.gateResolver) {
      if (emoji === '✅') {
        logger.info(
          `Gate advanced for feature ${gateData.featureId} via Discord reaction by ${userId}`
        );
        this.pendingGateMessages.delete(messageId);
        this.gateMessagesByFeature.delete(gateData.featureId);
        await this.gateResolver(gateData.featureId, gateData.projectPath, 'advance');
        return;
      } else if (emoji === '❌') {
        logger.info(
          `Gate rejected for feature ${gateData.featureId} via Discord reaction by ${userId}`
        );
        this.pendingGateMessages.delete(messageId);
        this.gateMessagesByFeature.delete(gateData.featureId);
        await this.gateResolver(gateData.featureId, gateData.projectPath, 'reject');
        return;
      }
    }

    const approval = this.approvalMessages.get(messageId);
    if (!approval) return;

    if (emoji === '✅') {
      // Approve - transition the idea/feature forward
      logger.info(`Feature ${approval.featureId} approved via Discord reaction by ${userId}`);

      // Emit approval event
      this.events.emit('authority:cto-approved-idea', {
        projectPath: approval.projectPath,
        featureId: approval.featureId,
        approvedBy: `discord:${userId}`,
      });

      // Post confirmation
      try {
        const feature = await this.featureLoader.get(approval.projectPath, approval.featureId);
        const channel = this.client?.channels.cache.get(
          this.pendingIdeas.get(approval.featureId)?.channelId || CHANNELS.suggestions
        ) as TextChannel;
        if (channel) {
          await channel.send(
            `✅ **Approved:** "${feature?.title || approval.featureId}"\n` +
              `Moving to decomposition and assignment pipeline.`
          );
        }
      } catch {
        // Non-fatal
      }

      this.approvalMessages.delete(messageId);
    } else if (emoji === '❌') {
      // Reject
      logger.info(`Feature ${approval.featureId} rejected via Discord reaction by ${userId}`);

      try {
        await this.featureLoader.update(approval.projectPath, approval.featureId, {
          status: 'done',
          workItemState: 'done',
          error: 'Rejected by CTO via Discord',
        });

        const feature = await this.featureLoader.get(approval.projectPath, approval.featureId);
        const channel = this.client?.channels.cache.get(CHANNELS.suggestions) as TextChannel;
        if (channel) {
          await channel.send(`❌ **Rejected:** "${feature?.title || approval.featureId}"`);
        }
      } catch {
        // Non-fatal
      }

      this.approvalMessages.delete(messageId);
    }
  }

  /**
   * Send a direct message to a user by username.
   * @param username Discord username (e.g., "john_doe")
   * @param content Message content to send
   * @returns true if message was sent successfully
   */
  async sendDM(username: string, content: string): Promise<boolean> {
    if (!this.client) {
      logger.error('Cannot send DM: Discord client not initialized');
      return false;
    }

    try {
      // Fetch guild to search for user
      const guild = await this.client.guilds.fetch(GUILD_ID);
      if (!guild) {
        logger.error(`Guild ${GUILD_ID} not found`);
        return false;
      }

      // Search for user by username
      const members = await guild.members.fetch({ query: username, limit: 1 });
      if (members.size === 0) {
        logger.error(`User ${username} not found in guild`);
        return false;
      }

      const member = members.first();
      if (!member) {
        logger.error(`Failed to get member for username ${username}`);
        return false;
      }

      // Send DM
      await member.user.send(content);

      // Emit DM sent event
      this.events.emit('discord:dm:sent', {
        username,
        content,
        timestamp: new Date().toISOString(),
      });

      logger.info(`DM sent to ${username}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send DM to ${username}:`, error);
      // Common error: user has DMs disabled
      if (error instanceof Error && error.message.includes('Cannot send messages to this user')) {
        logger.warn(`User ${username} has DMs disabled`);
      }
      return false;
    }
  }

  /**
   * Read direct messages from a user by username.
   * @param username Discord username (e.g., "john_doe")
   * @param limit Maximum number of messages to return (default: 10)
   * @returns Array of message objects
   */
  async readDMs(
    username: string,
    limit: number = 10
  ): Promise<Array<{ id: string; content: string; author: string; timestamp: string }>> {
    if (!this.client) {
      logger.error('Cannot read DMs: Discord client not initialized');
      return [];
    }

    try {
      const guild = await this.client.guilds.fetch(GUILD_ID);
      if (!guild) {
        logger.error(`Guild ${GUILD_ID} not found`);
        return [];
      }

      const members = await guild.members.fetch({ query: username, limit: 1 });
      if (members.size === 0) {
        logger.error(`User ${username} not found in guild`);
        return [];
      }

      const member = members.first();
      if (!member) {
        logger.error(`Failed to get member for username ${username}`);
        return [];
      }

      const dmChannel = await member.user.createDM();
      const messages = await dmChannel.messages.fetch({ limit });

      return Array.from(messages.values()).map((msg) => ({
        id: msg.id,
        content: msg.content,
        author: msg.author.username,
        timestamp: msg.createdAt.toISOString(),
      }));
    } catch (error) {
      logger.error(`Failed to read DMs for ${username}:`, error);
      return [];
    }
  }

  /**
   * Send a message to a specific channel.
   */
  async sendToChannel(channelId: string, content: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      const channel = (await this.client.channels.fetch(channelId)) as TextChannel;
      if (!channel?.isTextBased()) return false;
      await channel.send(content);
      return true;
    } catch (error) {
      logger.error(`Failed to send to channel ${channelId}:`, error);
      return false;
    }
  }

  /**
   * Read recent messages from a channel.
   */
  async readMessages(
    channelId: string,
    limit: number = 10
  ): Promise<
    Array<{
      id: string;
      content: string;
      author: { id: string; username: string; bot: boolean };
      timestamp: string;
      mentions: string[];
      hasAttachments: boolean;
    }>
  > {
    if (!this.client) return [];

    try {
      const channel = (await this.client.channels.fetch(channelId)) as TextChannel;
      if (!channel?.isTextBased()) return [];

      const messages = await channel.messages.fetch({ limit });
      return Array.from(messages.values()).map((msg) => ({
        id: msg.id,
        content: msg.content,
        author: {
          id: msg.author.id,
          username: msg.author.username,
          bot: msg.author.bot,
        },
        timestamp: msg.createdAt.toISOString(),
        mentions: Array.from(msg.mentions.users.values()).map((user) => user.id),
        hasAttachments: msg.attachments.size > 0,
      }));
    } catch (error) {
      logger.error(`Failed to read messages from channel ${channelId}:`, error);
      return [];
    }
  }

  /**
   * Create a thread for an extended conversation.
   */
  async createThread(channelId: string, messageId: string, name: string): Promise<string | null> {
    if (!this.client) return null;

    try {
      const channel = (await this.client.channels.fetch(channelId)) as TextChannel;
      if (!channel?.isTextBased()) return null;

      const thread = await channel.threads.create({
        name: name.slice(0, 100), // Discord thread name limit
        autoArchiveDuration: 1440, // 24 hours
        type: ChannelType.PublicThread,
        startMessage: messageId,
      });

      logger.info(`Created thread ${thread.id} in channel ${channelId}`);
      return thread.id;
    } catch (error) {
      logger.error(`Failed to create thread in channel ${channelId}:`, error);
      return null;
    }
  }

  /**
   * Check if the bot is connected.
   */
  isConnected(): boolean {
    return this.client?.isReady() ?? false;
  }

  /**
   * Gracefully disconnect the bot.
   */
  async stop(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      this.initialized = false;
      logger.info('Discord bot disconnected');
    }
  }
}
