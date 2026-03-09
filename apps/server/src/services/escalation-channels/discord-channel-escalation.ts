/**
 * Discord Channel Escalation Channel
 *
 * Routes escalation signals to appropriate Discord text channels based on signal type:
 * - Code issues → #dev
 * - Infrastructure issues → #infra
 * - Strategic issues → #ava-josh
 *
 * Features:
 * - Routes high severity and above to Discord channels
 * - Severity badges in message formatting
 * - Source context and action items included
 * - Configurable channel mapping
 */

import { createLogger } from '@protolabsai/utils';
import type { EscalationChannel, EscalationSignal } from '@protolabsai/types';
import { EscalationSeverity, EscalationSource } from '@protolabsai/types';
import type { DiscordService } from '../discord-service.js';

const logger = createLogger('DiscordChannelEscalation');

/**
 * Channel routing configuration
 * Maps signal sources to Discord channel names
 */
export interface ChannelRoutingConfig {
  /** Channel for code-related issues (pr_feedback, ci_failure) */
  devChannel: string;
  /** Channel for infrastructure issues (agent_failure, health_check) */
  infraChannel: string;
  /** Channel for strategic issues (sla_breach, board_anomaly, lead_engineer_escalation, human_mention) */
  strategicChannel: string;
}

/**
 * Default channel routing configuration
 */
const DEFAULT_ROUTING_CONFIG: ChannelRoutingConfig = {
  devChannel: 'dev',
  infraChannel: 'infra',
  strategicChannel: 'ava-josh',
};

/**
 * Discord Channel Escalation Channel Implementation
 *
 * Routes escalation signals to Discord text channels based on signal type and severity.
 * Only handles signals with high severity or above.
 */
export class DiscordChannelEscalation implements EscalationChannel {
  public readonly name = 'discord-channel';
  private discordService: DiscordService;
  private config: ChannelRoutingConfig;

  /**
   * Rate limit: max 10 messages per 5 minutes per channel
   */
  public readonly rateLimit = {
    maxSignals: 10,
    windowMs: 5 * 60 * 1000,
  };

  constructor(discordService: DiscordService, config: Partial<ChannelRoutingConfig> = {}) {
    this.discordService = discordService;
    this.config = { ...DEFAULT_ROUTING_CONFIG, ...config };
    logger.info('DiscordChannelEscalation initialized', {
      devChannel: this.config.devChannel,
      infraChannel: this.config.infraChannel,
      strategicChannel: this.config.strategicChannel,
    });
  }

  /**
   * Determines if this channel can handle the signal
   * Only handles high severity and above
   */
  canHandle(signal: EscalationSignal): boolean {
    const severityOrder = [
      EscalationSeverity.low,
      EscalationSeverity.medium,
      EscalationSeverity.high,
      EscalationSeverity.critical,
      EscalationSeverity.emergency,
    ];

    const signalSeverityIndex = severityOrder.indexOf(signal.severity);
    const highSeverityIndex = severityOrder.indexOf(EscalationSeverity.high);

    return signalSeverityIndex >= highSeverityIndex;
  }

  /**
   * Sends the escalation signal to the appropriate Discord channel as an embed
   */
  async send(signal: EscalationSignal): Promise<void> {
    const channelName = this.getChannelForSignal(signal);
    const embed = this.formatEmbed(signal);

    logger.info(`Routing ${signal.severity} signal to #${channelName}`, {
      source: signal.source,
      type: signal.type,
    });

    try {
      // Find channel by name to get channelId
      const channelResult = await this.discordService.findChannel(channelName);

      if (!channelResult.success || !channelResult.data) {
        throw new Error(channelResult.error || `Channel #${channelName} not found`);
      }

      // Send embed to channel
      const sendResult = await this.discordService.sendEmbed({
        channelId: channelResult.data.id,
        embed,
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error || 'Failed to send Discord embed');
      }

      logger.info(`Successfully sent escalation embed to #${channelName}`, {
        signalType: signal.type,
        channelId: channelResult.data.id,
      });
    } catch (error) {
      logger.error(`Failed to send escalation to #${channelName}:`, error);
      throw error;
    }
  }

  /**
   * Determines which channel to route the signal to based on source
   */
  private getChannelForSignal(signal: EscalationSignal): string {
    const { source } = signal;

    // Code-related issues → #dev
    if (source === EscalationSource.pr_feedback || source === EscalationSource.ci_failure) {
      return this.config.devChannel;
    }

    // Infrastructure issues → #infra
    if (
      source === EscalationSource.agent_failure ||
      source === EscalationSource.health_check ||
      source === EscalationSource.human_blocked_dependency
    ) {
      return this.config.infraChannel;
    }

    // Strategic issues → #ava-josh (or configured strategic channel)
    if (
      source === EscalationSource.sla_breach ||
      source === EscalationSource.board_anomaly ||
      source === EscalationSource.lead_engineer_escalation ||
      source === EscalationSource.human_mention
    ) {
      return this.config.strategicChannel;
    }

    // Default to strategic channel for unknown sources
    logger.warn(`Unknown escalation source: ${source}, routing to strategic channel`);
    return this.config.strategicChannel;
  }

  /**
   * Formats the escalation signal into a Discord embed
   */
  private formatEmbed(signal: EscalationSignal): {
    title: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  } {
    const sourceContext = this.getSourceContext(signal);
    const actionItems = this.getActionItems(signal);

    return {
      title: `Escalation: ${signal.type}`,
      description: sourceContext,
      color: this.getSeverityColor(signal.severity),
      fields: [
        { name: 'Severity', value: signal.severity.toUpperCase(), inline: true },
        { name: 'Source', value: signal.source, inline: true },
        { name: 'Action Items', value: actionItems },
      ],
      footer: { text: `Key: ${signal.deduplicationKey} | protoLabs Studio` },
      timestamp: signal.timestamp || new Date().toISOString(),
    };
  }

  /**
   * Gets the Discord embed color for the severity level
   */
  private getSeverityColor(severity: EscalationSeverity): number {
    switch (severity) {
      case EscalationSeverity.emergency:
        return 0xed4245; // red
      case EscalationSeverity.critical:
        return 0xed4245; // red
      case EscalationSeverity.high:
        return 0xe67e22; // orange
      case EscalationSeverity.medium:
        return 0xf1c40f; // yellow
      case EscalationSeverity.low:
        return 0x2ecc71; // green
      default:
        return 0x95a5a6; // grey
    }
  }

  /**
   * Extracts and formats source context from the signal
   */
  private getSourceContext(signal: EscalationSignal): string {
    const lines: string[] = [];

    lines.push(`- **Source:** ${signal.source}`);

    // Add context details
    if (signal.context) {
      for (const [key, value] of Object.entries(signal.context)) {
        // Skip large or sensitive data
        if (typeof value === 'object' && value !== null) {
          continue;
        }
        lines.push(`- **${this.formatKey(key)}:** ${value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generates action items based on signal source and context
   */
  private getActionItems(signal: EscalationSignal): string {
    const items: string[] = [];

    switch (signal.source) {
      case EscalationSource.pr_feedback:
        items.push('- Review PR comments and address feedback');
        items.push('- Update code based on reviewer suggestions');
        items.push('- Re-request review when changes are complete');
        break;

      case EscalationSource.ci_failure:
        items.push('- Check CI/CD logs for failure details');
        items.push('- Fix failing tests or build issues');
        items.push('- Re-run pipeline after fixes');
        break;

      case EscalationSource.agent_failure:
        items.push('- Review agent execution logs');
        items.push('- Investigate root cause of failure');
        items.push('- Restart agent if issue is transient');
        break;

      case EscalationSource.health_check:
        items.push('- Check system health metrics');
        items.push('- Investigate degraded services');
        items.push('- Restore service health or escalate further');
        break;

      case EscalationSource.sla_breach:
        items.push('- Review SLA breach details');
        items.push('- Assess impact on project timeline');
        items.push('- Adjust priorities or escalate to leadership');
        break;

      case EscalationSource.board_anomaly:
        items.push('- Review board state for inconsistencies');
        items.push('- Correct any data integrity issues');
        items.push('- Update automation rules if needed');
        break;

      case EscalationSource.lead_engineer_escalation:
        items.push('- Review Lead Engineer escalation details');
        items.push('- Provide guidance or unblock Lead Engineer');
        items.push('- Adjust project configuration if needed');
        break;

      case EscalationSource.human_mention:
        items.push('- Review the comment or message requiring attention');
        items.push('- Respond to the human mention');
        items.push('- Take appropriate action based on request');
        break;

      case EscalationSource.human_blocked_dependency:
        items.push('- Review the blocking dependencies assigned to humans');
        items.push('- Contact the blocking assignees to expedite their work');
        items.push('- Consider reassigning or adjusting priorities');
        break;

      default:
        items.push('- Review escalation details');
        items.push('- Investigate and take appropriate action');
        break;
    }

    return items.join('\n');
  }

  /**
   * Formats a context key for display (converts snake_case to Title Case)
   */
  private formatKey(key: string): string {
    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
