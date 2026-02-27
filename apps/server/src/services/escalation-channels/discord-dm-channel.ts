/**
 * Discord DM Escalation Channel
 *
 * Sends emergency and critical escalation signals via Discord DM
 * to configured recipients.
 *
 * Features:
 * - Emergency/critical severity only
 * - Rate limiting: max 1 DM per 15min per dedup key
 * - Rich message format with severity badges and action URLs
 * - Acknowledge mechanism via reaction (checkmark)
 * - Configurable recipient list
 */

import type { EscalationSignal, EscalationChannel, EscalationSeverity } from '@protolabs-ai/types';
import { EscalationSeverity as Severity, EscalationSource } from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import type { DiscordBotService } from '../discord-bot-service.js';
import type { EventEmitter } from '../../lib/events.js';

interface AcknowledgmentCapable {
  acknowledgeSignal(
    deduplicationKey: string,
    acknowledgedBy: string,
    notes?: string,
    clearDedup?: boolean
  ): { success: boolean; error?: string };
}

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
  recipients: [], // Configure via settings or UserProfile
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
  private escalationRouter?: AcknowledgmentCapable;
  private acknowledgments = new Map<string, AcknowledgmentEntry>();
  /** Tracks which deduplication keys a recipient is waiting to acknowledge */
  private recipientPendingSignals = new Map<string, string[]>();

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
    config?: Partial<DiscordDMChannelConfig>,
    escalationRouter?: AcknowledgmentCapable
  ) {
    this.discordBot = discordBot;
    this.events = events;
    this.escalationRouter = escalationRouter;
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
   * Handles emergency and critical severity, plus medium severity for human_blocked_dependency
   */
  canHandle(signal: EscalationSignal): boolean {
    // Always handle emergency and critical
    if (signal.severity === Severity.emergency || signal.severity === Severity.critical) {
      return true;
    }

    // Also handle medium severity human_blocked_dependency signals
    if (
      signal.severity === Severity.medium &&
      signal.source === EscalationSource.human_blocked_dependency
    ) {
      return true;
    }

    return false;
  }

  /**
   * Send escalation signal via Discord DM
   */
  async send(signal: EscalationSignal): Promise<void> {
    if (!this.discordBot.isConnected()) {
      throw new Error('Discord bot is not connected');
    }

    const message = this.formatMessage(signal);

    // Determine recipients based on signal source
    let recipients: string[];
    if (signal.source === EscalationSource.human_blocked_dependency) {
      // Extract blocking assignees from signal context
      recipients = this.extractBlockingAssignees(signal);
      if (recipients.length === 0) {
        logger.warn(
          `No blocking assignees found in human_blocked_dependency signal: ${signal.deduplicationKey}`
        );
        // Fall back to configured recipients
        recipients = this.config.recipients;
      }
    } else {
      // Use configured recipients for other signals
      recipients = this.config.recipients;
    }

    // Send to all recipients
    const sendPromises = recipients.map(async (username) => {
      try {
        const success = await this.discordBot.sendDM(username, message);
        if (!success) {
          logger.error(`Failed to send DM to ${username}`);
          throw new Error(`Failed to send DM to ${username}`);
        }
        logger.info(`Escalation sent to ${username}: ${signal.deduplicationKey}`);

        // Track which deduplication keys each recipient has pending
        const pending = this.recipientPendingSignals.get(username) ?? [];
        pending.push(signal.deduplicationKey);
        this.recipientPendingSignals.set(username, pending);
      } catch (error) {
        logger.error(`Error sending DM to ${username}:`, error);
        throw error;
      }
    });

    await Promise.all(sendPromises);

    // Track acknowledgment
    this.acknowledgments.set(signal.deduplicationKey, {
      signalDeduplicationKey: signal.deduplicationKey,
      messageId: '',
    });
  }

  /**
   * Extract blocking assignees from human_blocked_dependency signal context
   */
  private extractBlockingAssignees(signal: EscalationSignal): string[] {
    const ctx = signal.context;
    const assignees: string[] = [];

    // Extract from humanBlockerDetails string format: "featureId (assigned to username)"
    if (typeof ctx.humanBlockerDetails === 'string') {
      const matches = ctx.humanBlockerDetails.matchAll(/assigned to (\w+)/g);
      for (const match of matches) {
        if (match[1] && match[1] !== 'unknown') {
          assignees.push(match[1]);
        }
      }
    }

    // Deduplicate assignees
    return Array.from(new Set(assignees));
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
      return `https://github.com/${process.env.GITHUB_REPO_OWNER || 'proto-labs-ai'}/${repo}/pull/${ctx.prNumber}`;
    }
    if (ctx.issueNumber && typeof ctx.issueNumber === 'number') {
      const repo = ctx.repo || 'automaker';
      return `https://github.com/${process.env.GITHUB_REPO_OWNER || 'proto-labs-ai'}/${repo}/issues/${ctx.issueNumber}`;
    }

    return null;
  }

  /**
   * Setup listener for acknowledgment via DM reply containing /ack or /acknowledge
   */
  private setupAcknowledgmentListener(): void {
    this.events.subscribe((type, payload) => {
      if (type !== 'discord:dm:received') return;

      const { username, content } = payload as { username: string; content: string };
      const lower = content.toLowerCase().trim();

      if (!lower.startsWith('/ack') && !lower.startsWith('/acknowledge')) return;

      const pending = this.recipientPendingSignals.get(username);
      if (!pending || pending.length === 0) {
        logger.debug(`No pending escalation signals for ${username}`);
        return;
      }

      if (!this.escalationRouter) {
        logger.warn('No escalation router configured — cannot acknowledge signal');
        return;
      }

      // Acknowledge all pending signals for this recipient
      for (const deduplicationKey of pending) {
        const ack = this.acknowledgments.get(deduplicationKey);
        if (ack && !ack.acknowledgedBy) {
          const result = this.escalationRouter.acknowledgeSignal(deduplicationKey, username);
          if (result.success) {
            ack.acknowledgedBy = username;
            ack.acknowledgedAt = new Date().toISOString();
            logger.info(`Escalation acknowledged by ${username} via DM: ${deduplicationKey}`);
          } else {
            logger.warn(
              `Failed to acknowledge signal ${deduplicationKey} for ${username}: ${result.error}`
            );
          }
        }
      }

      // Clear pending signals for this recipient after acknowledgment
      this.recipientPendingSignals.delete(username);
    });
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
    for (const [_key, ack] of this.acknowledgments.entries()) {
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
