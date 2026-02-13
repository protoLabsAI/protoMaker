/**
 * Discord DM Escalation Channel
 *
 * Sends emergency and critical escalation signals via Discord DM
 * to configured recipients (Josh/chukz by default).
 *
 * Features:
 * - Emergency/critical severity only
 * - Rate limiting: max 1 DM per 15min per dedup key
 * - Rich message format with severity badges and action URLs
 * - Acknowledge mechanism via reaction (checkmark)
 * - Configurable recipient list
 */

import type { EscalationSignal, EscalationChannel, EscalationSeverity } from '@automaker/types';
import { EscalationSeverity as Severity } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { DiscordBotService } from '../discord-bot-service.js';
import type { EventEmitter } from '../../lib/events.js';

const logger = createLogger('DiscordDMChannel');

/**
 * Configuration for Discord DM escalation channel
 */
export interface DiscordDMChannelConfig {
  /** List of Discord usernames to receive DMs */
  recipients: string[];
  /** Rate limit window in milliseconds (default: 15 minutes) */
  rateLimitWindowMs?: number;
  /** Maximum messages per window (default: 1) */
  maxMessagesPerWindow?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<DiscordDMChannelConfig> = {
  recipients: ['chukz'], // Josh's Discord username
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  maxMessagesPerWindow: 1,
};

/**
 * Acknowledgment tracking entry
 */
interface AcknowledgmentEntry {
  signalDeduplicationKey: string;
  messageId: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

/**
 * Discord DM Escalation Channel
 */
export class DiscordDMChannel implements EscalationChannel {
  readonly name = 'discord-dm';
  private config: Required<DiscordDMChannelConfig>;
  private discordBot: DiscordBotService;
  private events: EventEmitter;
  private acknowledgments = new Map<string, AcknowledgmentEntry>();

  /**
   * Rate limiting configuration
   * Router will handle rate limiting based on this config
   */
  rateLimit = {
    maxSignals: 1,
    windowMs: 15 * 60 * 1000, // 15 minutes
  };

  constructor(
    discordBot: DiscordBotService,
    events: EventEmitter,
    config?: Partial<DiscordDMChannelConfig>
  ) {
    this.discordBot = discordBot;
    this.events = events;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      recipients: config?.recipients ?? DEFAULT_CONFIG.recipients,
    };

    // Update rate limit based on config
    if (config?.rateLimitWindowMs !== undefined) {
      this.rateLimit.windowMs = config.rateLimitWindowMs;
    }
    if (config?.maxMessagesPerWindow !== undefined) {
      this.rateLimit.maxSignals = config.maxMessagesPerWindow;
    }

    this.setupAcknowledgmentListener();
    logger.info(
      `DiscordDMChannel initialized (recipients: ${this.config.recipients.join(', ')}, ` +
        `rate limit: ${this.rateLimit.maxSignals}/${this.rateLimit.windowMs}ms)`
    );
  }

  /**
   * Check if this channel can handle the signal
   * Only handles emergency and critical severity
   */
  canHandle(signal: EscalationSignal): boolean {
    return signal.severity === Severity.emergency || signal.severity === Severity.critical;
  }

  /**
   * Send escalation signal via Discord DM
   */
  async send(signal: EscalationSignal): Promise<void> {
    if (!this.discordBot.isConnected()) {
      throw new Error('Discord bot is not connected');
    }

    const message = this.formatMessage(signal);

    // Send to all configured recipients
    const sendPromises = this.config.recipients.map(async (username) => {
      try {
        const success = await this.discordBot.sendDM(username, message);
        if (!success) {
          logger.error(`Failed to send DM to ${username}`);
          throw new Error(`Failed to send DM to ${username}`);
        }
        logger.info(`Escalation sent to ${username}: ${signal.deduplicationKey}`);
      } catch (error) {
        logger.error(`Error sending DM to ${username}:`, error);
        throw error;
      }
    });

    await Promise.all(sendPromises);

    // Track acknowledgment (we'd need message IDs from Discord to track reactions)
    // For now, just track that we sent it
    this.acknowledgments.set(signal.deduplicationKey, {
      signalDeduplicationKey: signal.deduplicationKey,
      messageId: '', // Would need to capture from sendDM response
    });
  }

  /**
   * Format escalation signal into Discord message
   */
  private formatMessage(signal: EscalationSignal): string {
    const badge = this.getSeverityBadge(signal.severity);
    const source = signal.source.replace(/_/g, ' ').toUpperCase();
    const summary = this.extractSummary(signal);
    const actionUrl = this.extractActionUrl(signal);

    let message = `${badge} **${source}**\n\n`;
    message += `**${signal.type}**\n`;
    message += `${summary}\n\n`;

    if (actionUrl) {
      message += `🔗 **Action Required:** ${actionUrl}\n`;
    }

    message += `\n_React with ✅ to acknowledge_`;
    message += `\n\`Dedup Key: ${signal.deduplicationKey}\``;

    return message;
  }

  /**
   * Get severity badge emoji
   */
  private getSeverityBadge(severity: EscalationSeverity): string {
    switch (severity) {
      case Severity.emergency:
        return '🚨 **EMERGENCY**';
      case Severity.critical:
        return '⚠️ **CRITICAL**';
      case Severity.high:
        return '⚡ **HIGH**';
      case Severity.medium:
        return '📋 **MEDIUM**';
      case Severity.low:
        return 'ℹ️ **LOW**';
      default:
        return '❓ **UNKNOWN**';
    }
  }

  /**
   * Extract summary from signal context
   */
  private extractSummary(signal: EscalationSignal): string {
    const ctx = signal.context;

    // Try common summary fields
    if (typeof ctx.summary === 'string') return ctx.summary;
    if (typeof ctx.message === 'string') return ctx.message;
    if (typeof ctx.description === 'string') return ctx.description;
    if (typeof ctx.error === 'string') return ctx.error;

    // Build summary from available context
    const parts: string[] = [];
    if (ctx.featureId) parts.push(`Feature: ${ctx.featureId}`);
    if (ctx.prNumber) parts.push(`PR #${ctx.prNumber}`);
    if (ctx.issueNumber) parts.push(`Issue #${ctx.issueNumber}`);
    if (ctx.status) parts.push(`Status: ${ctx.status}`);

    return parts.length > 0 ? parts.join(' • ') : 'No summary available';
  }

  /**
   * Extract action URL from signal context
   */
  private extractActionUrl(signal: EscalationSignal): string | null {
    const ctx = signal.context;

    // Try common URL fields
    if (typeof ctx.url === 'string') return ctx.url;
    if (typeof ctx.actionUrl === 'string') return ctx.actionUrl;
    if (typeof ctx.link === 'string') return ctx.link;
    if (typeof ctx.prUrl === 'string') return ctx.prUrl;
    if (typeof ctx.issueUrl === 'string') return ctx.issueUrl;

    // Build URL from GitHub context
    if (ctx.prNumber && typeof ctx.prNumber === 'number') {
      const repo = ctx.repo || 'automaker'; // Fallback to default repo
      return `https://github.com/chukzzy/${repo}/pull/${ctx.prNumber}`;
    }
    if (ctx.issueNumber && typeof ctx.issueNumber === 'number') {
      const repo = ctx.repo || 'automaker';
      return `https://github.com/chukzzy/${repo}/issues/${ctx.issueNumber}`;
    }

    return null;
  }

  /**
   * Setup listener for acknowledgment reactions
   */
  private setupAcknowledgmentListener(): void {
    // Listen for Discord reaction events
    // Note: This would require the Discord bot service to emit reaction events
    // For now, this is a placeholder for future reaction-based acknowledgment
    // TODO: Add discord:reaction:added event type to @automaker/types when implementing
    // this.events.subscribe((type, payload: any) => {
    //   if (type === 'discord:reaction:added') {
    //     this.handleReaction(payload);
    //   }
    // });
  }

  /**
   * Handle reaction event for acknowledgment
   */
  private handleReaction(payload: {
    emoji: string;
    userId: string;
    username: string;
    messageId: string;
  }): void {
    // Only process checkmark reactions
    if (payload.emoji !== '✅') return;

    // Find the acknowledgment entry for this message
    for (const [key, ack] of this.acknowledgments.entries()) {
      if (ack.messageId === payload.messageId && !ack.acknowledgedBy) {
        // Mark as acknowledged
        ack.acknowledgedBy = payload.username;
        ack.acknowledgedAt = new Date().toISOString();

        logger.info(
          `Escalation acknowledged by ${payload.username}: ${ack.signalDeduplicationKey}`
        );

        // Note: Would emit acknowledgment event here when event type is added
        // this.events.emit('escalation:acknowledged', {
        //   deduplicationKey: ack.signalDeduplicationKey,
        //   acknowledgedBy: payload.username,
        //   acknowledgedAt: ack.acknowledgedAt,
        // });

        break;
      }
    }
  }

  /**
   * Get acknowledgment status for a signal
   */
  getAcknowledgmentStatus(deduplicationKey: string): AcknowledgmentEntry | undefined {
    return this.acknowledgments.get(deduplicationKey);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DiscordDMChannelConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    // Update rate limit if needed
    if (config.rateLimitWindowMs !== undefined) {
      this.rateLimit.windowMs = config.rateLimitWindowMs;
    }
    if (config.maxMessagesPerWindow !== undefined) {
      this.rateLimit.maxSignals = config.maxMessagesPerWindow;
    }

    logger.info(`DiscordDMChannel config updated:`, this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<DiscordDMChannelConfig> {
    return { ...this.config };
  }
}
