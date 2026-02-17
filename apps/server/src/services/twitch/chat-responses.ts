/**
 * Twitch Chat Bot Responses
 *
 * Handles chat commands and bot responses:
 * - !help - Lists available commands
 * - !queue - Shows top 5 suggestions with vote counts
 * - !status - Shows current build status
 *
 * Feature completion announcements with PR links are handled by event listeners.
 */

import { createLogger } from '@automaker/utils';
import type { TwitchSuggestion } from '@automaker/types';

const logger = createLogger('TwitchChatResponses');

export interface ChatCommand {
  command: string;
  description: string;
  handler: (args: string[]) => Promise<string>;
}

/**
 * Chat Bot Response Handler
 *
 * Processes commands and returns response messages for the Twitch chat bot.
 */
export class ChatResponseHandler {
  private getSuggestions: () => Promise<TwitchSuggestion[]>;
  private getCurrentBuild: () => Promise<{ title: string; status: string } | null>;

  constructor(
    getSuggestions: () => Promise<TwitchSuggestion[]>,
    getCurrentBuild: () => Promise<{ title: string; status: string } | null>
  ) {
    this.getSuggestions = getSuggestions;
    this.getCurrentBuild = getCurrentBuild;
  }

  /**
   * Get available commands
   */
  getCommands(): ChatCommand[] {
    return [
      {
        command: '!help',
        description: 'Show available commands',
        handler: async () => this.handleHelp(),
      },
      {
        command: '!queue',
        description: 'Show top 5 suggestions',
        handler: async () => this.handleQueue(),
      },
      {
        command: '!status',
        description: 'Show current build status',
        handler: async () => this.handleStatus(),
      },
    ];
  }

  /**
   * Process a chat message and return a response (if it's a command)
   */
  async processMessage(message: string): Promise<string | null> {
    const trimmed = message.trim().toLowerCase();

    if (trimmed === '!help') {
      return this.handleHelp();
    }

    if (trimmed === '!queue') {
      return this.handleQueue();
    }

    if (trimmed === '!status') {
      return this.handleStatus();
    }

    // Not a recognized command
    return null;
  }

  /**
   * Handle !help command
   */
  private async handleHelp(): Promise<string> {
    const commands = this.getCommands();
    const commandList = commands.map((cmd) => `${cmd.command} - ${cmd.description}`).join(' | ');
    return `Available commands: ${commandList}`;
  }

  /**
   * Handle !queue command
   */
  private async handleQueue(): Promise<string> {
    try {
      const suggestions = await this.getSuggestions();

      if (suggestions.length === 0) {
        return 'The suggestion queue is empty! Use !idea "your suggestion" to add one.';
      }

      // Get top 5 unprocessed suggestions
      const topSuggestions = suggestions.filter((s) => !s.processed).slice(0, 5);

      if (topSuggestions.length === 0) {
        return 'All suggestions have been processed! Use !idea "your suggestion" to add more.';
      }

      const queueList = topSuggestions
        .map((s, i) => `${i + 1}. ${s.suggestion} (by @${s.username})`)
        .join(' | ');

      return `Top suggestions: ${queueList}`;
    } catch (error) {
      logger.error('Error fetching queue:', error);
      return 'Error fetching suggestion queue. Please try again later.';
    }
  }

  /**
   * Handle !status command
   */
  private async handleStatus(): Promise<string> {
    try {
      const build = await this.getCurrentBuild();

      if (!build) {
        return 'No build in progress. The system is idle.';
      }

      return `Currently building: ${build.title} (Status: ${build.status})`;
    } catch (error) {
      logger.error('Error fetching status:', error);
      return 'Error fetching build status. Please try again later.';
    }
  }

  /**
   * Format a feature completion announcement
   *
   * Called when a feature is completed and merged.
   */
  static formatCompletionAnnouncement(featureTitle: string, prUrl?: string): string {
    if (prUrl) {
      return `✅ Feature completed: ${featureTitle} - PR: ${prUrl}`;
    }
    return `✅ Feature completed: ${featureTitle}`;
  }
}
