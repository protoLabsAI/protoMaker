/**
 * Discord Service - Handles Discord notifications via MCP tools
 *
 * Provides a notification system for sending formatted messages to Discord channels
 * with templates, retry logic, and rate limit handling.
 */

import { createLogger } from '@automaker/utils';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = createLogger('DiscordService');

/**
 * Template types for different notification scenarios
 */
export type NotificationTemplate =
  | 'feature_created'
  | 'feature_completed'
  | 'feature_error'
  | 'pr_merged'
  | 'auto_mode_summary';

/**
 * Context data for feature_created template
 */
export interface FeatureCreatedContext {
  featureId: string;
  title: string;
  description?: string;
  complexity?: string;
  assignee?: string;
}

/**
 * Context data for feature_completed template
 */
export interface FeatureCompletedContext {
  featureId: string;
  title: string;
  duration?: string;
  filesModified?: number;
  linesChanged?: number;
}

/**
 * Context data for feature_error template
 */
export interface FeatureErrorContext {
  featureId: string;
  title: string;
  error: string;
  attemptNumber?: number;
  maxAttempts?: number;
}

/**
 * Context data for pr_merged template
 */
export interface PRMergedContext {
  prNumber: number;
  title: string;
  author: string;
  featureId?: string;
  url?: string;
}

/**
 * Context data for auto_mode_summary template
 */
export interface AutoModeSummaryContext {
  totalFeatures: number;
  completed: number;
  failed: number;
  duration: string;
  details?: Array<{
    featureId: string;
    title: string;
    status: 'completed' | 'failed';
  }>;
}

/**
 * Union type for all template contexts
 */
export type TemplateContext =
  | FeatureCreatedContext
  | FeatureCompletedContext
  | FeatureErrorContext
  | PRMergedContext
  | AutoModeSummaryContext;

/**
 * Result of sending a notification
 */
export interface SendNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retriesUsed?: number;
}

/**
 * Discord embed color constants
 */
const EMBED_COLORS = {
  SUCCESS: 0x00ff00, // Green
  ERROR: 0xff0000, // Red
  INFO: 0x0099ff, // Blue
  WARNING: 0xffaa00, // Orange
} as const;

/**
 * DiscordService - Manages Discord notifications via MCP
 *
 * Features:
 * - Template-based message formatting
 * - Retry logic with exponential backoff
 * - Rate limit handling
 * - Markdown embed formatting
 */
export class DiscordService {
  private readonly maxRetries = 3;
  private readonly baseBackoffMs = 1000;
  private lastRequestTime = 0;
  private readonly minRequestIntervalMs = 500; // Rate limit: 2 requests per second

  /**
   * Send a notification to a Discord channel using a template
   *
   * @param channelId - Discord channel ID to send the message to
   * @param template - Template type to use for formatting
   * @param context - Context data for the template
   * @returns Promise resolving to the send result
   */
  async sendNotification(
    channelId: string,
    template: NotificationTemplate,
    context: TemplateContext
  ): Promise<SendNotificationResult> {
    logger.info(`Sending ${template} notification to channel ${channelId}`);

    // Format message using the appropriate template
    const message = this.formatMessage(template, context);

    // Send with retry logic
    return await this.sendWithRetry(channelId, message);
  }

  /**
   * Format a message using the specified template and context
   *
   * @param template - Template type to use
   * @param context - Context data for the template
   * @returns Formatted message string with markdown
   */
  private formatMessage(template: NotificationTemplate, context: TemplateContext): string {
    switch (template) {
      case 'feature_created':
        return this.formatFeatureCreated(context as FeatureCreatedContext);
      case 'feature_completed':
        return this.formatFeatureCompleted(context as FeatureCompletedContext);
      case 'feature_error':
        return this.formatFeatureError(context as FeatureErrorContext);
      case 'pr_merged':
        return this.formatPRMerged(context as PRMergedContext);
      case 'auto_mode_summary':
        return this.formatAutoModeSummary(context as AutoModeSummaryContext);
      default:
        throw new Error(`Unknown template: ${template}`);
    }
  }

  /**
   * Format feature_created template
   */
  private formatFeatureCreated(context: FeatureCreatedContext): string {
    const { featureId, title, description, complexity, assignee } = context;

    let message = `🆕 **New Feature Created**\n\n`;
    message += `**${title}**\n`;
    message += `\`${featureId}\`\n\n`;

    if (description) {
      message += `${description}\n\n`;
    }

    if (complexity || assignee) {
      message += `**Details:**\n`;
      if (complexity) {
        message += `• Complexity: \`${complexity}\`\n`;
      }
      if (assignee) {
        message += `• Assignee: ${assignee}\n`;
      }
    }

    return message;
  }

  /**
   * Format feature_completed template
   */
  private formatFeatureCompleted(context: FeatureCompletedContext): string {
    const { featureId, title, duration, filesModified, linesChanged } = context;

    let message = `✅ **Feature Completed**\n\n`;
    message += `**${title}**\n`;
    message += `\`${featureId}\`\n\n`;

    if (duration || filesModified !== undefined || linesChanged !== undefined) {
      message += `**Stats:**\n`;
      if (duration) {
        message += `• Duration: ${duration}\n`;
      }
      if (filesModified !== undefined) {
        message += `• Files Modified: ${filesModified}\n`;
      }
      if (linesChanged !== undefined) {
        message += `• Lines Changed: ${linesChanged}\n`;
      }
    }

    return message;
  }

  /**
   * Format feature_error template
   */
  private formatFeatureError(context: FeatureErrorContext): string {
    const { featureId, title, error, attemptNumber, maxAttempts } = context;

    let message = `❌ **Feature Error**\n\n`;
    message += `**${title}**\n`;
    message += `\`${featureId}\`\n\n`;

    if (attemptNumber !== undefined && maxAttempts !== undefined) {
      message += `**Attempt:** ${attemptNumber}/${maxAttempts}\n\n`;
    }

    message += `**Error:**\n`;
    message += `\`\`\`\n${error}\n\`\`\`\n`;

    return message;
  }

  /**
   * Format pr_merged template
   */
  private formatPRMerged(context: PRMergedContext): string {
    const { prNumber, title, author, featureId, url } = context;

    let message = `🚀 **Pull Request Merged**\n\n`;
    message += `**#${prNumber}: ${title}**\n`;
    message += `Author: ${author}\n\n`;

    if (featureId) {
      message += `Feature: \`${featureId}\`\n`;
    }

    if (url) {
      message += `\n[View PR](${url})\n`;
    }

    message += `\n**Please pull latest changes:**\n`;
    message += `\`\`\`\ngit pull origin main\n\`\`\`\n`;

    return message;
  }

  /**
   * Format auto_mode_summary template
   */
  private formatAutoModeSummary(context: AutoModeSummaryContext): string {
    const { totalFeatures, completed, failed, duration, details } = context;

    let message = `📊 **Auto-Mode Summary**\n\n`;
    message += `**Duration:** ${duration}\n`;
    message += `**Total Features:** ${totalFeatures}\n`;
    message += `**Completed:** ✅ ${completed}\n`;
    message += `**Failed:** ❌ ${failed}\n\n`;

    if (details && details.length > 0) {
      message += `**Feature Details:**\n`;
      for (const detail of details) {
        const icon = detail.status === 'completed' ? '✅' : '❌';
        message += `${icon} ${detail.title} (\`${detail.featureId}\`)\n`;
      }
    }

    return message;
  }

  /**
   * Send a message with retry logic and exponential backoff
   *
   * @param channelId - Discord channel ID
   * @param message - Formatted message to send
   * @returns Promise resolving to the send result
   */
  private async sendWithRetry(
    channelId: string,
    message: string
  ): Promise<SendNotificationResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Rate limit handling - ensure minimum interval between requests
        await this.enforceRateLimit();

        // Send via Discord MCP
        const messageId = await this.sendToDiscord(channelId, message);

        logger.info(`Successfully sent notification to channel ${channelId}`);
        return {
          success: true,
          messageId,
          retriesUsed: attempt - 1,
        };
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Attempt ${attempt}/${this.maxRetries} failed:`, error);

        // Check if it's a rate limit error (HTTP 429)
        const isRateLimitError = this.isRateLimitError(error);

        if (attempt < this.maxRetries) {
          // Calculate backoff with exponential growth
          const backoffMs = this.calculateBackoff(attempt, isRateLimitError);
          logger.info(`Retrying in ${backoffMs}ms...`);
          await this.sleep(backoffMs);
        }
      }
    }

    // All retries exhausted
    logger.error(`Failed to send notification after ${this.maxRetries} attempts`);
    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      retriesUsed: this.maxRetries,
    };
  }

  /**
   * Send a message to Discord via MCP tools
   *
   * @param channelId - Discord channel ID
   * @param message - Message content
   * @returns Promise resolving to the message ID
   */
  private async sendToDiscord(channelId: string, message: string): Promise<string> {
    try {
      // Escape special characters for shell
      const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');

      // Call Discord MCP via Claude CLI
      const command = `claude mcp call discord mcp__discord__send_message '{"channelId":"${channelId}","message":"${escapedMessage}"}'`;

      const { stdout, stderr } = await execAsync(command, {
        env: process.env,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      if (stderr) {
        logger.debug('Discord MCP stderr:', stderr);
      }

      // Parse the response to get message ID
      try {
        const response = JSON.parse(stdout);
        return response.messageId || 'unknown';
      } catch {
        // If parsing fails, return a placeholder
        return 'sent';
      }
    } catch (error) {
      logger.error('Failed to send to Discord:', error);
      throw error;
    }
  }

  /**
   * Enforce rate limiting by waiting if necessary
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestIntervalMs) {
      const waitTime = this.minRequestIntervalMs - timeSinceLastRequest;
      logger.debug(`Rate limit: waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Calculate backoff duration with exponential growth
   *
   * @param attempt - Current attempt number (1-indexed)
   * @param isRateLimit - Whether the error was a rate limit error
   * @returns Backoff duration in milliseconds
   */
  private calculateBackoff(attempt: number, isRateLimit: boolean): number {
    // For rate limit errors, use longer backoff
    const base = isRateLimit ? this.baseBackoffMs * 2 : this.baseBackoffMs;

    // Exponential: base * 2^(attempt-1)
    // Attempt 1: 1s, Attempt 2: 2s, Attempt 3: 4s
    const backoff = base * Math.pow(2, attempt - 1);

    // Add jitter to prevent thundering herd (±20%)
    const jitter = backoff * 0.2 * (Math.random() - 0.5);

    return Math.floor(backoff + jitter);
  }

  /**
   * Check if an error is a rate limit error
   *
   * @param error - Error to check
   * @returns True if the error indicates rate limiting
   */
  private isRateLimitError(error: unknown): boolean {
    if (!error) return false;

    const errorStr = String(error).toLowerCase();
    return (
      errorStr.includes('rate limit') ||
      errorStr.includes('429') ||
      errorStr.includes('too many requests')
    );
  }

  /**
   * Sleep for a specified duration
   *
   * @param ms - Duration in milliseconds
   * @returns Promise that resolves after the duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if Discord MCP is available
   *
   * @returns Promise resolving to true if Discord MCP is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const command = 'claude mcp list';
      const { stdout } = await execAsync(command, { env: process.env });
      return stdout.toLowerCase().includes('discord');
    } catch (error) {
      logger.debug('Discord MCP not available:', error);
      return false;
    }
  }
}

// Singleton instance
let discordServiceInstance: DiscordService | null = null;

/**
 * Get the singleton Discord service instance
 */
export function getDiscordService(): DiscordService {
  if (!discordServiceInstance) {
    discordServiceInstance = new DiscordService();
  }
  return discordServiceInstance;
}
