/**
 * Bug Feature Escalation Channel
 *
 * Creates in-app bug features on the "bugs" project board for code-level
 * findings that need tracking:
 * - Security vulnerabilities
 * - Recurring code patterns
 * - CI infrastructure failures
 *
 * Labels: severity, source, category
 * Links to: PR, file paths, CodeRabbit thread URLs
 */

import { createLogger } from '@protolabsai/utils';
import {
  EscalationSource,
  EscalationSeverity,
  type EscalationChannel,
  type EscalationSignal,
} from '@protolabsai/types';
import type { FeatureLoader } from '../feature-loader.js';
import type { EventEmitter } from '../../lib/events.js';

const logger = createLogger('GitHubIssueChannel');

export interface GitHubIssueChannelConfig {
  /** FeatureLoader for accessing feature data */
  featureLoader: FeatureLoader;
  /** Project path for feature operations */
  projectPath: string;
  /** Event emitter for broadcasting bug creation to WebSocket clients */
  events: EventEmitter;
}

/**
 * Maps escalation severity to GitHub issue labels
 */
function severityToLabel(severity: EscalationSeverity): string {
  const labelMap: Record<EscalationSeverity, string> = {
    emergency: 'severity:emergency',
    critical: 'severity:critical',
    high: 'severity:high',
    medium: 'severity:medium',
    low: 'severity:low',
  };
  return labelMap[severity];
}

/**
 * Maps escalation source to GitHub issue labels
 */
function sourceToLabel(source: EscalationSource): string {
  const labelMap: Record<EscalationSource, string> = {
    pr_feedback: 'source:pr-feedback',
    agent_failure: 'source:agent-failure',
    ci_failure: 'source:ci-failure',
    health_check: 'source:health-check',
    lead_engineer_escalation: 'source:lead-engineer-escalation',
    sla_breach: 'source:sla-breach',
    board_anomaly: 'source:board-anomaly',
    human_mention: 'source:human-mention',
    agent_needs_input: 'source:agent-needs-input',
    lead_engineer: 'source:lead-engineer',
    lead_engineer_state_machine: 'source:lead-engineer-state-machine',
    auto_mode_health_sweep: 'source:auto-mode-health-sweep',
  };
  return labelMap[source];
}

/**
 * GitHubIssueChannel implements EscalationChannel by creating in-app bug features
 */
export class GitHubIssueChannel implements EscalationChannel {
  readonly name = 'github-issue';
  private config: GitHubIssueChannelConfig;
  private issuedDeduplicationKeys = new Set<string>();

  constructor(config: GitHubIssueChannelConfig) {
    this.config = config;
    logger.info('GitHubIssueChannel initialized (creating in-app bug features)');
  }

  /**
   * Rate limit: max 10 issues per hour to prevent spam
   */
  rateLimit = {
    maxSignals: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  };

  /**
   * Handle signals related to code-level findings requiring PR references
   */
  canHandle(signal: EscalationSignal): boolean {
    // Only handle medium+ severity (critical issues should go to other channels too)
    if (
      signal.severity === EscalationSeverity.low ||
      signal.severity === EscalationSeverity.emergency
    ) {
      return false;
    }

    // Handle code-level findings that need issue tracking
    const codeLevelSources: EscalationSource[] = [
      EscalationSource.pr_feedback,
      EscalationSource.ci_failure,
      EscalationSource.agent_failure,
    ];

    return codeLevelSources.includes(signal.source);
  }

  /**
   * Send escalation signal by creating an in-app bug feature
   */
  async send(signal: EscalationSignal): Promise<void> {
    // Check if we've already created a bug for this deduplication key
    if (this.issuedDeduplicationKeys.has(signal.deduplicationKey)) {
      logger.debug(`Bug already filed for deduplication key: ${signal.deduplicationKey}`);
      return;
    }

    // Reserve dedup key before any async work to prevent parallel duplicates
    this.issuedDeduplicationKeys.add(signal.deduplicationKey);

    try {
      const title = this.buildIssueTitle(signal);
      const body = await this.buildIssueBody(signal);

      const bugFeature = await this.config.featureLoader.create(this.config.projectPath, {
        title,
        description: body,
        category: 'bug',
        projectSlug: 'bugs',
        complexity: 'medium',
        status: 'backlog',
      });

      logger.info(`Created bug feature for signal ${signal.type}: ${bugFeature.id}`);

      this.config.events.emit('issue:created', {
        featureId: signal.context.featureId,
        projectPath: this.config.projectPath,
        bugFeatureId: bugFeature.id,
        source: signal.source,
        severity: signal.severity,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Roll back dedup key so the signal can be retried
      this.issuedDeduplicationKeys.delete(signal.deduplicationKey);
      logger.error(`Failed to create bug feature for signal ${signal.type}:`, error);
      throw error;
    }
  }

  /**
   * Build issue title
   */
  private buildIssueTitle(signal: EscalationSignal): string {
    const featureId = signal.context.featureId as string | undefined;
    const prNumber = signal.context.prNumber as number | undefined;

    let title = `[Escalation] ${signal.type}`;

    if (featureId) {
      title += ` - ${featureId}`;
    }

    if (prNumber) {
      title += ` (PR #${prNumber})`;
    }

    // Truncate if too long
    return title.length > 200 ? title.slice(0, 197) + '...' : title;
  }

  /**
   * Build issue body with full context
   */
  private async buildIssueBody(signal: EscalationSignal): Promise<string> {
    const sections: string[] = [];

    // Header
    sections.push('## Escalation Signal');
    sections.push('');
    sections.push(`This bug was automatically created by the escalation system.`);
    sections.push('');

    // Signal details
    sections.push('### Signal Details');
    sections.push('');
    sections.push('| Field | Value |');
    sections.push('|-------|-------|');
    sections.push(`| **Type** | \`${signal.type}\` |`);
    sections.push(`| **Severity** | ${signal.severity} |`);
    sections.push(`| **Source** | ${signal.source} |`);
    sections.push(`| **Timestamp** | ${signal.timestamp || new Date().toISOString()} |`);
    sections.push('');

    // Context details
    const featureId = signal.context.featureId as string | undefined;
    const prNumber = signal.context.prNumber as number | undefined;
    const filePaths = signal.context.filePaths as string[] | undefined;
    const coderabbitThreadUrl = signal.context.coderabbitThreadUrl as string | undefined;
    const category = signal.context.category as string | undefined;
    const message = signal.context.message as string | undefined;
    const error = signal.context.error as string | undefined;

    sections.push('### Context');
    sections.push('');

    if (featureId) {
      sections.push(`- **Feature ID**: \`${featureId}\``);

      // Try to load feature for additional context
      const feature = await this.config.featureLoader.get(this.config.projectPath, featureId);

      if (feature) {
        if (feature.title) {
          sections.push(`- **Feature Title**: ${feature.title}`);
        }
        if (feature.branchName) {
          sections.push(`- **Branch**: \`${feature.branchName}\``);
        }
        if (feature.prNumber) {
          sections.push(`- **PR**: #${feature.prNumber}`);
        }
      }
    }

    if (prNumber) {
      sections.push(`- **PR Number**: #${prNumber}`);
    }

    if (category) {
      sections.push(`- **Category**: ${category}`);
    }

    if (filePaths && filePaths.length > 0) {
      sections.push('- **Affected Files**:');
      for (const path of filePaths.slice(0, 10)) {
        sections.push(`  - \`${path}\``);
      }
      if (filePaths.length > 10) {
        sections.push(`  - ... and ${filePaths.length - 10} more`);
      }
    }

    if (coderabbitThreadUrl) {
      sections.push(`- **CodeRabbit Thread**: ${coderabbitThreadUrl}`);
    }

    sections.push('');

    // Message/Error details
    if (message) {
      sections.push('### Message');
      sections.push('');
      sections.push('```');
      sections.push(message.slice(0, 2000));
      sections.push('```');
      sections.push('');
    }

    if (error) {
      sections.push('### Error');
      sections.push('');
      sections.push('```');
      sections.push(error.slice(0, 2000));
      sections.push('```');
      sections.push('');
    }

    // Additional context
    const otherContext = Object.entries(signal.context).filter(
      ([key]) =>
        ![
          'featureId',
          'prNumber',
          'filePaths',
          'coderabbitThreadUrl',
          'category',
          'message',
          'error',
        ].includes(key)
    );

    if (otherContext.length > 0) {
      sections.push('### Additional Context');
      sections.push('');
      sections.push('```json');
      sections.push(JSON.stringify(Object.fromEntries(otherContext), null, 2).slice(0, 1000));
      sections.push('```');
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Build issue labels (kept for logging/categorization)
   */
  private buildLabels(signal: EscalationSignal): string[] {
    const labels: string[] = ['escalation', 'automated'];

    // Add severity label
    labels.push(severityToLabel(signal.severity));

    // Add source label
    labels.push(sourceToLabel(signal.source));

    // Add category label if provided
    const category = signal.context.category as string | undefined;
    if (category) {
      labels.push(`category:${category}`);
    }

    return labels;
  }

  /**
   * Clear deduplication cache (for testing)
   */
  clearCache(): void {
    this.issuedDeduplicationKeys.clear();
  }
}
