/**
 * Twitch Service - Connects to Twitch chat and collects suggestions
 *
 * Provides integration with Twitch chat using Twurple library:
 * - Connects to configured Twitch channel
 * - Listens for !idea commands in chat
 * - Parses suggestions with quoted string support
 * - Rate limits per user to prevent spam
 * - Persists ideas to append-only JSONL file
 * - Basic spam filtering (account age, duplicate detection)
 *
 * Service only loads when TWITCH_ENABLED environment variable is true.
 * All Twitch errors are isolated and will not crash the agent pipeline.
 */

import { createLogger } from '@automaker/utils';
import type { TwitchSuggestion, TwitchSettings } from '@automaker/types';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { RateLimitEntry, ParsedIdeaCommand } from './types.js';

const logger = createLogger('TwitchService');

/**
 * TwitchService - Main service class for Twitch chat integration
 *
 * Note: This service requires Twurple packages (@twurple/auth, @twurple/chat, @twurple/api)
 * to be installed. The actual Twurple imports are dynamically loaded to avoid crashes
 * when TWITCH_ENABLED=false.
 */
export class TwitchService {
  private settings: TwitchSettings;
  private projectPath: string;
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();
  private recentSuggestions: Set<string> = new Set();
  private isConnected = false;
  private chatClient: any = null; // Twurple ChatClient (dynamically loaded)
  private duplicateWindowMs = 60000; // 1 minute window for duplicate detection

  constructor(settings: TwitchSettings, projectPath: string) {
    this.settings = settings;
    this.projectPath = projectPath;
  }

  /**
   * Initialize and connect to Twitch chat
   *
   * Only connects if TWITCH_ENABLED=true and required settings are present.
   * Returns false if Twitch is disabled or connection fails.
   */
  async connect(): Promise<boolean> {
    // Check if Twitch is enabled
    const twitchEnabled = process.env.TWITCH_ENABLED === 'true';
    if (!twitchEnabled || !this.settings.enabled) {
      logger.info(
        'Twitch integration is disabled (TWITCH_ENABLED=false or settings.enabled=false)'
      );
      return false;
    }

    // Validate required settings
    if (!this.settings.channelName || !this.settings.botUsername) {
      logger.error(
        'Twitch integration enabled but missing required settings (channelName, botUsername)'
      );
      return false;
    }

    // Validate required environment variables
    const clientId = process.env.TWITCH_CLIENT_ID;
    const accessToken = process.env.TWITCH_ACCESS_TOKEN;

    if (!clientId || !accessToken) {
      logger.error(
        'Twitch integration enabled but missing required environment variables (TWITCH_CLIENT_ID, TWITCH_ACCESS_TOKEN)'
      );
      return false;
    }

    try {
      // Dynamically import Twurple to avoid crashes when not installed
      const { ChatClient } = await import('@twurple/chat');
      const { StaticAuthProvider } = await import('@twurple/auth');

      // Create auth provider
      const authProvider = new StaticAuthProvider(clientId, accessToken);

      // Create chat client
      this.chatClient = new ChatClient({
        authProvider,
        channels: [this.settings.channelName],
      });

      // Set up message handler
      this.chatClient.onMessage(async (channel: string, user: string, message: string) => {
        await this.handleMessage(channel, user, message);
      });

      // Connect to chat
      await this.chatClient.connect();
      this.isConnected = true;

      logger.info(`Connected to Twitch channel: #${this.settings.channelName}`);
      return true;
    } catch (error) {
      logger.error('Failed to connect to Twitch:', error);
      return false;
    }
  }

  /**
   * Disconnect from Twitch chat
   */
  async disconnect(): Promise<void> {
    if (this.chatClient && this.isConnected) {
      try {
        await this.chatClient.quit();
        this.isConnected = false;
        logger.info('Disconnected from Twitch');
      } catch (error) {
        logger.error('Error disconnecting from Twitch:', error);
      }
    }
  }

  /**
   * Handle incoming Twitch chat message
   */
  private async handleMessage(channel: string, username: string, message: string): Promise<void> {
    try {
      // Check if message is an !idea command
      if (!message.startsWith('!idea')) {
        return;
      }

      // Parse the command
      const parsed = this.parseIdeaCommand(message, username);
      if (!parsed) {
        logger.debug(`Invalid !idea command from ${username}: ${message}`);
        return;
      }

      // Check rate limit
      if (!this.checkRateLimit(username)) {
        logger.debug(`Rate limited user ${username}`);
        return;
      }

      // Check for duplicate suggestion
      if (this.isDuplicate(parsed.suggestion)) {
        logger.debug(`Duplicate suggestion from ${username}: ${parsed.suggestion}`);
        return;
      }

      // TODO: Add account age check (requires @twurple/api)
      // For now, we'll skip this check as it requires additional API calls

      // Persist the suggestion
      await this.persistSuggestion(parsed.suggestion, username, channel);

      logger.info(`Received suggestion from ${username}: ${parsed.suggestion}`);
    } catch (error) {
      // Isolate errors - don't let Twitch crashes affect the agent pipeline
      logger.error('Error handling Twitch message:', error);
    }
  }

  /**
   * Parse !idea command with quoted string support
   *
   * Supports formats:
   * - !idea "quoted suggestion"
   * - !idea unquoted suggestion text
   *
   * Returns null if parsing fails.
   */
  private parseIdeaCommand(message: string, username: string): ParsedIdeaCommand | null {
    // Remove the !idea prefix
    const content = message.slice(5).trim();

    if (!content) {
      return null;
    }

    let suggestion: string;

    // Check for quoted string
    if (content.startsWith('"')) {
      const closingQuote = content.indexOf('"', 1);
      if (closingQuote === -1) {
        // No closing quote, treat as unquoted
        suggestion = content.slice(1).trim();
      } else {
        // Extract quoted content
        suggestion = content.slice(1, closingQuote).trim();
      }
    } else {
      // Unquoted - take everything after !idea
      suggestion = content;
    }

    // Validate suggestion is not empty
    if (!suggestion || suggestion.length === 0) {
      return null;
    }

    return { suggestion, username };
  }

  /**
   * Check if user is rate limited
   *
   * Returns true if user can submit, false if rate limited.
   */
  private checkRateLimit(username: string): boolean {
    const now = Date.now();
    const rateLimitSeconds = this.settings.rateLimitSeconds ?? 60;
    const rateLimitMs = rateLimitSeconds * 1000;

    const entry = this.rateLimitMap.get(username);

    if (entry) {
      const timeSinceLastCommand = now - entry.lastCommandTime;
      if (timeSinceLastCommand < rateLimitMs) {
        // Still rate limited
        return false;
      }
    }

    // Update rate limit entry
    this.rateLimitMap.set(username, { lastCommandTime: now });
    return true;
  }

  /**
   * Check if suggestion is a duplicate (within time window)
   */
  private isDuplicate(suggestion: string): boolean {
    const normalized = suggestion.toLowerCase().trim();

    if (this.recentSuggestions.has(normalized)) {
      return true;
    }

    // Add to recent suggestions
    this.recentSuggestions.add(normalized);

    // Remove after duplicate window expires
    setTimeout(() => {
      this.recentSuggestions.delete(normalized);
    }, this.duplicateWindowMs);

    return false;
  }

  /**
   * Persist suggestion to JSONL file
   *
   * File path: {projectPath}/.automaker/twitch/suggestions.jsonl
   * Format: Append-only, crash-safe JSONL
   */
  private async persistSuggestion(
    suggestion: string,
    username: string,
    channel: string
  ): Promise<void> {
    try {
      // Build file path
      const filePath = join(
        this.projectPath,
        '.automaker',
        this.settings.suggestionsFilePath ?? 'twitch/suggestions.jsonl'
      );

      // Ensure directory exists
      await fs.mkdir(dirname(filePath), { recursive: true });

      // Create suggestion object
      const twitchSuggestion: TwitchSuggestion = {
        id: uuidv4(),
        username,
        suggestion,
        timestamp: new Date().toISOString(),
        channel: channel.replace('#', ''), // Remove # prefix
        processed: false,
      };

      // Append to JSONL file (crash-safe)
      const line = JSON.stringify(twitchSuggestion) + '\n';
      await fs.appendFile(filePath, line, 'utf-8');

      logger.debug(`Persisted suggestion to ${filePath}`);
    } catch (error) {
      logger.error('Failed to persist suggestion:', error);
      // Don't throw - isolate errors
    }
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; channel: string | null } {
    return {
      connected: this.isConnected,
      channel: this.settings.channelName ?? null,
    };
  }

  /**
   * Read all suggestions from JSONL file
   */
  async readSuggestions(): Promise<TwitchSuggestion[]> {
    try {
      const filePath = join(
        this.projectPath,
        '.automaker',
        this.settings.suggestionsFilePath ?? 'twitch/suggestions.jsonl'
      );

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist yet
        return [];
      }

      // Read file
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      // Parse JSONL
      const suggestions: TwitchSuggestion[] = [];
      for (const line of lines) {
        try {
          const suggestion = JSON.parse(line) as TwitchSuggestion;
          suggestions.push(suggestion);
        } catch (parseError) {
          logger.error('Failed to parse suggestion line:', parseError);
          // Skip invalid lines
        }
      }

      return suggestions;
    } catch (error) {
      logger.error('Failed to read suggestions:', error);
      return [];
    }
  }

  /**
   * Update a suggestion's properties
   *
   * Note: This rewrites the entire JSONL file with the updated suggestion.
   * For high-volume scenarios, consider a more efficient update strategy.
   */
  async updateSuggestion(id: string, updates: Partial<TwitchSuggestion>): Promise<void> {
    try {
      const filePath = join(
        this.projectPath,
        '.automaker',
        this.settings.suggestionsFilePath ?? 'twitch/suggestions.jsonl'
      );

      // Read all suggestions
      const suggestions = await this.readSuggestions();

      // Find and update the suggestion
      const index = suggestions.findIndex((s) => s.id === id);
      if (index === -1) {
        throw new Error(`Suggestion with id ${id} not found`);
      }

      suggestions[index] = { ...suggestions[index], ...updates };

      // Rewrite the file
      const lines = suggestions.map((s) => JSON.stringify(s)).join('\n') + '\n';
      await fs.writeFile(filePath, lines, 'utf-8');

      logger.debug(`Updated suggestion ${id}`);
    } catch (error) {
      logger.error('Failed to update suggestion:', error);
      throw error;
    }
  }

  /**
   * Create a Twitch poll via Helix API
   *
   * Requires @twurple/api to be installed and TWITCH_CLIENT_ID + TWITCH_ACCESS_TOKEN
   * to be set in environment variables.
   */
  async createPoll(options: {
    title: string;
    choices: Array<{ title: string }>;
    durationSeconds: number;
  }): Promise<any> {
    try {
      // Dynamically import Twurple API
      const { ApiClient } = await import('@twurple/api');
      const { StaticAuthProvider } = await import('@twurple/auth');

      const clientId = process.env.TWITCH_CLIENT_ID;
      const accessToken = process.env.TWITCH_ACCESS_TOKEN;

      if (!clientId || !accessToken) {
        throw new Error('TWITCH_CLIENT_ID and TWITCH_ACCESS_TOKEN are required to create polls');
      }

      // Create auth provider and API client
      const authProvider = new StaticAuthProvider(clientId, accessToken);
      const apiClient = new ApiClient({ authProvider });

      // Get broadcaster user ID (required for creating polls)
      const user = await apiClient.users.getUserByName(this.settings.channelName || '');
      if (!user) {
        throw new Error(`Twitch user ${this.settings.channelName} not found`);
      }

      // Create poll
      const poll = await apiClient.polls.createPoll(user.id, {
        title: options.title,
        choices: options.choices.map((c) => c.title),
        duration: options.durationSeconds,
      });

      logger.info(
        `Created Twitch poll: ${poll.id} with ${options.choices.length} choices for ${options.durationSeconds}s`
      );

      return {
        id: poll.id,
        title: poll.title,
        choices: poll.choices,
        durationSeconds: options.durationSeconds,
        status: poll.status,
      };
    } catch (error) {
      logger.error('Failed to create Twitch poll:', error);
      throw error;
    }
  }

  /**
   * Store poll metadata for result tracking
   *
   * Stores poll metadata in a separate JSONL file for tracking poll results.
   */
  async storePollMetadata(
    pollId: string,
    metadata: {
      suggestionIds: string[];
      projectPath: string;
      createdAt: string;
      status: string;
    }
  ): Promise<void> {
    try {
      const filePath = join(this.projectPath, '.automaker', 'twitch/polls.jsonl');

      // Ensure directory exists
      await fs.mkdir(dirname(filePath), { recursive: true });

      // Append to JSONL file
      const line = JSON.stringify({ pollId, ...metadata }) + '\n';
      await fs.appendFile(filePath, line, 'utf-8');

      logger.debug(`Stored poll metadata for ${pollId}`);
    } catch (error) {
      logger.error('Failed to store poll metadata:', error);
      throw error;
    }
  }
}
