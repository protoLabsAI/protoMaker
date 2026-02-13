/**
 * Beads Escalation Channel
 *
 * Routes escalation signals to Beads (bd CLI) for operational tracking.
 * Creates issues with severity-mapped priority for all medium+ signals.
 * Automatically closes issues on resolution.
 *
 * Features:
 * - Creates Beads issues for medium severity and above
 * - Maps escalation severity to Beads priority (emergency=1, critical=2, high=3, medium=4)
 * - Tracks escalation issues for auto-closure
 * - Labels issues with 'escalation' and source type
 */

import { createLogger } from '@automaker/utils';
import type { EscalationChannel, EscalationSignal } from '@automaker/types';
import { EscalationSeverity } from '@automaker/types';
import type { BeadsService } from '../beads-service.js';

const logger = createLogger('BeadsChannel');

/**
 * Beads Escalation Channel Implementation
 *
 * Routes escalation signals to Beads for operational tracking.
 * Only handles signals with medium severity or above.
 */
export class BeadsChannel implements EscalationChannel {
  public readonly name = 'beads';
  private beadsService: BeadsService;
  private projectPath: string;
  private issueTracker: Map<string, string> = new Map(); // deduplicationKey -> taskId

  /**
   * Rate limit: max 20 issues per 10 minutes
   */
  public readonly rateLimit = {
    maxSignals: 20,
    windowMs: 10 * 60 * 1000,
  };

  constructor(beadsService: BeadsService, projectPath: string) {
    this.beadsService = beadsService;
    this.projectPath = projectPath;
    logger.info('BeadsChannel initialized', { projectPath });
  }

  /**
   * Determines if this channel can handle the signal
   * Only handles medium severity and above
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
    const mediumSeverityIndex = severityOrder.indexOf(EscalationSeverity.medium);

    return signalSeverityIndex >= mediumSeverityIndex;
  }

  /**
   * Sends the escalation signal to Beads
   */
  async send(signal: EscalationSignal): Promise<void> {
    const priority = this.mapSeverityToPriority(signal.severity);
    const title = this.formatTitle(signal);
    const description = this.formatDescription(signal);
    const labels = ['escalation', signal.source];

    logger.info(`Creating Beads issue for ${signal.severity} signal`, {
      type: signal.type,
      priority,
    });

    try {
      // Create Beads task
      const result = await this.beadsService.createTask(this.projectPath, {
        title,
        description,
        priority,
        issueType: 'task',
        labels,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to create Beads task');
      }

      // Track the issue for potential auto-closure
      this.issueTracker.set(signal.deduplicationKey, result.data.id);

      logger.info(`Successfully created Beads issue`, {
        taskId: result.data.id,
        signalType: signal.type,
        priority,
      });
    } catch (error) {
      logger.error(`Failed to create Beads issue:`, error);
      throw error;
    }
  }

  /**
   * Close a Beads issue associated with a signal (for auto-resolution)
   */
  async closeIssue(deduplicationKey: string): Promise<void> {
    const taskId = this.issueTracker.get(deduplicationKey);

    if (!taskId) {
      logger.debug(`No tracked issue found for deduplication key: ${deduplicationKey}`);
      return;
    }

    try {
      const result = await this.beadsService.closeTask(this.projectPath, taskId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to close Beads task');
      }

      this.issueTracker.delete(deduplicationKey);

      logger.info(`Successfully closed Beads issue`, {
        taskId,
        deduplicationKey,
      });
    } catch (error) {
      logger.error(`Failed to close Beads issue:`, error);
      throw error;
    }
  }

  /**
   * Maps escalation severity to Beads priority
   * emergency -> 1 (highest)
   * critical -> 2
   * high -> 3
   * medium -> 4
   */
  private mapSeverityToPriority(severity: EscalationSeverity): number {
    switch (severity) {
      case EscalationSeverity.emergency:
        return 1;
      case EscalationSeverity.critical:
        return 2;
      case EscalationSeverity.high:
        return 3;
      case EscalationSeverity.medium:
        return 4;
      default:
        return 4;
    }
  }

  /**
   * Formats the escalation signal into a Beads issue title
   */
  private formatTitle(signal: EscalationSignal): string {
    const severityLabel = signal.severity.toUpperCase();
    return `[${severityLabel}] ${signal.type}`;
  }

  /**
   * Formats the escalation signal into a Beads issue description
   */
  private formatDescription(signal: EscalationSignal): string {
    const lines: string[] = [];

    lines.push(`# Escalation: ${signal.type}`);
    lines.push('');
    lines.push(`**Severity:** ${signal.severity}`);
    lines.push(`**Source:** ${signal.source}`);
    lines.push(`**Timestamp:** ${signal.timestamp || new Date().toISOString()}`);
    lines.push(`**Deduplication Key:** ${signal.deduplicationKey}`);
    lines.push('');

    // Add context details
    if (signal.context && Object.keys(signal.context).length > 0) {
      lines.push('## Context');
      for (const [key, value] of Object.entries(signal.context)) {
        // Skip large objects
        if (typeof value === 'object' && value !== null) {
          lines.push(`- **${this.formatKey(key)}:** [object]`);
        } else {
          lines.push(`- **${this.formatKey(key)}:** ${value}`);
        }
      }
      lines.push('');
    }

    lines.push('## Action Required');
    lines.push('This issue was automatically created by the escalation router.');
    lines.push('Review the context above and take appropriate action.');

    return lines.join('\n');
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

  /**
   * Get tracked issues count
   */
  getTrackedIssuesCount(): number {
    return this.issueTracker.size;
  }

  /**
   * Clear all tracked issues (for testing)
   */
  clearTrackedIssues(): void {
    this.issueTracker.clear();
  }
}
