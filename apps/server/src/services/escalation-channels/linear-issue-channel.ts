/**
 * Linear Issue Escalation Channel
 *
 * Creates Linear issues for critical/high severity signals that need human decisions.
 * Features:
 * - Automatic label tagging (needs-human-review, agent-generated, source:automaker, severity labels)
 * - Priority mapping (emergency=1, critical=2, high=3)
 * - Team routing based on signal type
 * - Deduplication: updates existing issue instead of creating duplicates for recurring patterns
 * - Links back to Automaker feature/PR
 *
 * Usage:
 *   const channel = new LinearIssueChannel(settingsService, projectPath);
 *   escalationRouter.registerChannel(channel);
 */

import type {
  EscalationChannel,
  EscalationSignal,
  EscalationSeverity,
  EscalationSource,
} from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import { LinearMCPClient, type CreateIssueOptions } from '../linear-mcp-client.js';
import type { SettingsService } from '../settings-service.js';
import type { EventEmitter } from '../../lib/events.js';

interface AcknowledgmentCapable {
  acknowledgeSignal(
    deduplicationKey: string,
    acknowledgedBy: string,
    notes?: string,
    clearDedup?: boolean
  ): { success: boolean; error?: string };
}

const logger = createLogger('LinearIssueChannel');

/**
 * Priority mapping from EscalationSeverity to Linear priority
 * Linear priority: 0=none, 1=urgent, 2=high, 3=normal, 4=low
 */
const PRIORITY_MAP: Record<string, number> = {
  emergency: 1, // Urgent
  critical: 2, // High
  high: 3, // Normal
  medium: 4, // Low
  low: 4, // Low
};

/**
 * Team routing based on signal source
 * Maps escalation sources to Linear team identifiers
 */
interface TeamConfig {
  /** Default team ID for general escalations */
  defaultTeamId: string;
  /** Team routing map: source type -> team ID */
  teamRouting?: Record<string, string>;
}

/**
 * Tracks recently created issues for deduplication
 */
interface RecentIssue {
  /** Linear issue ID */
  issueId: string;
  /** Issue identifier (e.g., "ENG-123") */
  identifier: string;
  /** Deduplication key that was used */
  deduplicationKey: string;
  /** Timestamp when issue was created/updated */
  timestamp: number;
  /** Number of times this issue has been updated due to recurrence */
  updateCount: number;
}

/**
 * LinearIssueChannel - Creates Linear issues for critical/high severity escalations
 */
export class LinearIssueChannel implements EscalationChannel {
  readonly name = 'linear-issue';

  /** Rate limit: max 10 issues per 5 minutes to avoid spam */
  readonly rateLimit = {
    maxSignals: 10,
    windowMs: 5 * 60 * 1000,
  };

  private linearClient: LinearMCPClient;
  private recentIssues: Map<string, RecentIssue> = new Map();
  private readonly DEDUPLICATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  private readonly MAX_RECENT_ISSUES = 100;
  /** Reverse lookup: Linear issue UUID -> deduplication key */
  private issueIdToDeduplicationKey: Map<string, string> = new Map();

  constructor(
    private settingsService: SettingsService,
    private projectPath: string,
    private teamConfig?: TeamConfig,
    linearClient?: LinearMCPClient,
    events?: EventEmitter,
    escalationRouter?: AcknowledgmentCapable
  ) {
    this.linearClient = linearClient || new LinearMCPClient(settingsService, projectPath);
    this.cleanupOldIssues(); // Initial cleanup

    if (events && escalationRouter) {
      this.setupAckListener(events, escalationRouter);
    }
  }

  /**
   * Subscribe to linear:comment:created events and acknowledge signals when
   * a comment containing /ack is posted on a tracked escalation issue.
   */
  private setupAckListener(events: EventEmitter, escalationRouter: AcknowledgmentCapable): void {
    events.subscribe((type, payload) => {
      if (type !== 'linear:comment:created') return;

      const { issueId, body, user } = payload as {
        issueId?: string;
        body: string;
        user?: { id: string; name: string };
      };

      if (!issueId) return;

      const deduplicationKey = this.issueIdToDeduplicationKey.get(issueId);
      if (!deduplicationKey) return;

      const lower = body.toLowerCase().trim();
      if (!lower.includes('/ack') && !lower.includes('/acknowledge')) return;

      const acknowledgedBy = user?.name ?? 'unknown';
      const result = escalationRouter.acknowledgeSignal(deduplicationKey, acknowledgedBy);

      if (result.success) {
        logger.info(
          `Escalation acknowledged via Linear comment by ${acknowledgedBy}: ${deduplicationKey}`
        );
      } else {
        logger.warn(
          `Failed to acknowledge signal ${deduplicationKey} via Linear comment: ${result.error}`
        );
      }
    });
  }

  /**
   * Determines if this channel can handle the given signal
   * Only handles critical and high severity signals
   */
  canHandle(signal: EscalationSignal): boolean {
    // Only handle critical and high severity signals
    return signal.severity === 'critical' || signal.severity === 'high';
  }

  /**
   * Sends the escalation signal by creating or updating a Linear issue
   */
  async send(signal: EscalationSignal): Promise<void> {
    try {
      // Check for duplicate issue within deduplication window
      const existingIssue = this.findExistingIssue(signal.deduplicationKey);

      if (existingIssue) {
        // Update existing issue instead of creating a new one
        await this.updateExistingIssue(existingIssue, signal);
        logger.info(
          `Updated existing Linear issue ${existingIssue.identifier} for recurring signal: ${signal.type}`
        );
      } else {
        // Create new issue
        const result = await this.createNewIssue(signal);
        logger.info(
          `Created Linear issue ${result.identifier} for ${signal.severity} signal: ${signal.type}`
        );

        // Track for deduplication
        this.recentIssues.set(signal.deduplicationKey, {
          issueId: result.issueId,
          identifier: result.identifier || 'unknown',
          deduplicationKey: signal.deduplicationKey,
          timestamp: Date.now(),
          updateCount: 0,
        });

        // Track reverse lookup for acknowledgment via comment
        this.issueIdToDeduplicationKey.set(result.issueId, signal.deduplicationKey);

        // Cleanup old issues periodically
        if (this.recentIssues.size > this.MAX_RECENT_ISSUES) {
          this.cleanupOldIssues();
        }
      }
    } catch (error) {
      logger.error('Failed to create/update Linear issue:', error);
      throw error;
    }
  }

  /**
   * Find existing issue by deduplication key within time window
   */
  private findExistingIssue(deduplicationKey: string): RecentIssue | undefined {
    const existing = this.recentIssues.get(deduplicationKey);
    if (!existing) return undefined;

    const age = Date.now() - existing.timestamp;
    if (age > this.DEDUPLICATION_WINDOW_MS) {
      // Issue is too old, remove from tracking
      this.recentIssues.delete(deduplicationKey);
      return undefined;
    }

    return existing;
  }

  /**
   * Create a new Linear issue for the escalation signal
   */
  private async createNewIssue(signal: EscalationSignal): Promise<{
    issueId: string;
    identifier: string;
  }> {
    const title = this.buildIssueTitle(signal);
    const description = this.buildIssueDescription(signal);
    const teamId = this.getTeamId(signal);
    const priority = this.getPriority(signal.severity);
    const labelIds = await this.getLabelIds(signal);

    const options: CreateIssueOptions = {
      title,
      description,
      teamId,
      priority,
      labelIds,
    };

    const result = await this.linearClient.createIssue(options);

    return {
      issueId: result.issueId,
      identifier: result.identifier || result.issueId,
    };
  }

  /**
   * Update an existing Linear issue with new occurrence information
   */
  private async updateExistingIssue(
    existingIssue: RecentIssue,
    signal: EscalationSignal
  ): Promise<void> {
    existingIssue.updateCount += 1;
    existingIssue.timestamp = Date.now();

    const updateComment = this.buildRecurrenceComment(signal, existingIssue.updateCount);

    await this.linearClient.addComment({
      issueId: existingIssue.issueId,
      body: updateComment,
    });

    logger.debug(
      `Added recurrence comment to issue ${existingIssue.identifier} (update #${existingIssue.updateCount})`
    );
  }

  /**
   * Build issue title from signal
   */
  private buildIssueTitle(signal: EscalationSignal): string {
    const severityTag = `[${signal.severity.toUpperCase()}]`;
    const sourceTag = `[${this.formatSource(signal.source)}]`;
    return `${severityTag} ${sourceTag} ${signal.type}`;
  }

  /**
   * Build detailed issue description with context and links
   */
  private buildIssueDescription(signal: EscalationSignal): string {
    const sections: string[] = [];

    // Header
    sections.push('# Escalation from Automaker');
    sections.push('');
    sections.push(
      '**This issue was automatically created by Automaker and requires human review.**'
    );
    sections.push('');

    // Signal details
    sections.push('## Signal Details');
    sections.push(`- **Source**: ${this.formatSource(signal.source)}`);
    sections.push(`- **Severity**: ${signal.severity}`);
    sections.push(`- **Type**: ${signal.type}`);
    sections.push(`- **Timestamp**: ${signal.timestamp || new Date().toISOString()}`);
    sections.push('');

    // Context
    if (signal.context && Object.keys(signal.context).length > 0) {
      sections.push('## Context');
      sections.push('```json');
      sections.push(JSON.stringify(signal.context, null, 2));
      sections.push('```');
      sections.push('');
    }

    // Links
    sections.push('## Links');
    const featureId = signal.context.featureId as string | undefined;
    const prUrl = signal.context.prUrl as string | undefined;
    const featurePath = signal.context.featurePath as string | undefined;

    if (featureId) {
      sections.push(`- **Feature ID**: \`${featureId}\``);
    }
    if (prUrl) {
      sections.push(`- **Pull Request**: ${prUrl}`);
    }
    if (featurePath) {
      sections.push(`- **Feature Path**: \`${featurePath}\``);
    }
    sections.push(`- **Project**: \`${this.projectPath}\``);
    sections.push('');

    // Action items
    sections.push('## Required Actions');
    sections.push('- [ ] Review the escalation details');
    sections.push('- [ ] Investigate the root cause');
    sections.push('- [ ] Take appropriate corrective action');
    sections.push('- [ ] Update Automaker configuration if needed');
    sections.push('');

    // Footer
    sections.push('---');
    sections.push('*Generated by Automaker Escalation Router*');

    return sections.join('\n');
  }

  /**
   * Build comment for recurring signal occurrences
   */
  private buildRecurrenceComment(signal: EscalationSignal, updateCount: number): string {
    const sections: string[] = [];

    sections.push(`## Recurring Signal Detected (Update #${updateCount})`);
    sections.push('');
    sections.push(
      '**This signal has occurred again. The issue is being tracked here instead of creating a new duplicate.**'
    );
    sections.push('');
    sections.push(`- **Timestamp**: ${signal.timestamp || new Date().toISOString()}`);
    sections.push(`- **Occurrences**: ${updateCount + 1} times`);
    sections.push('');

    // Context diff if changed
    if (signal.context && Object.keys(signal.context).length > 0) {
      sections.push('### Latest Context');
      sections.push('```json');
      sections.push(JSON.stringify(signal.context, null, 2));
      sections.push('```');
    }

    return sections.join('\n');
  }

  /**
   * Get Linear priority from escalation severity
   */
  private getPriority(severity: EscalationSeverity): number {
    return PRIORITY_MAP[severity] || 3; // Default to normal
  }

  /**
   * Get team ID based on signal source and configuration
   */
  private getTeamId(signal: EscalationSignal): string {
    // Check for team routing configuration
    if (this.teamConfig?.teamRouting) {
      const routedTeamId = this.teamConfig.teamRouting[signal.source];
      if (routedTeamId) {
        return routedTeamId;
      }
    }

    // Fallback to default team ID
    if (this.teamConfig?.defaultTeamId) {
      return this.teamConfig.defaultTeamId;
    }

    // If no team config is provided, throw error
    throw new Error(
      'No Linear team configuration found. Please configure teamConfig in LinearIssueChannel constructor.'
    );
  }

  /**
   * Get label IDs for the issue
   * Note: This is a simplified implementation. In production, you would query Linear
   * to find/create labels by name and return their IDs.
   */
  private async getLabelIds(signal: EscalationSignal): Promise<string[]> {
    // For now, return empty array since label creation requires additional Linear API calls
    // In a full implementation, you would:
    // 1. Query Linear for labels by name (needs-human-review, agent-generated, etc.)
    // 2. Create labels if they don't exist
    // 3. Return the label IDs
    //
    // The labels we want to apply:
    // - needs-human-review
    // - agent-generated
    // - source:automaker
    // - severity:{severity}

    logger.debug(
      `Would apply labels: needs-human-review, agent-generated, source:automaker, severity:${signal.severity}`
    );

    return [];
  }

  /**
   * Format source enum to human-readable string
   */
  private formatSource(source: EscalationSource): string {
    return source
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Cleanup old issues from tracking map
   */
  private cleanupOldIssues(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, issue] of Array.from(this.recentIssues.entries())) {
      if (now - issue.timestamp > this.DEDUPLICATION_WINDOW_MS) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.recentIssues.delete(key);
    }

    if (keysToDelete.length > 0) {
      logger.debug(`Cleaned up ${keysToDelete.length} old issue tracking entries`);
    }
  }

  /**
   * Get status information for this channel
   */
  getStatus(): {
    trackedIssues: number;
    oldestIssueAge: number | null;
  } {
    let oldestTimestamp = Date.now();

    for (const issue of Array.from(this.recentIssues.values())) {
      if (issue.timestamp < oldestTimestamp) {
        oldestTimestamp = issue.timestamp;
      }
    }

    return {
      trackedIssues: this.recentIssues.size,
      oldestIssueAge: this.recentIssues.size > 0 ? Date.now() - oldestTimestamp : null,
    };
  }
}
