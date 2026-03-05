/**
 * GitHub Issue Escalation Channel
 *
 * Creates GitHub issues for code-level findings that need PR references:
 * - Security vulnerabilities
 * - Recurring code patterns
 * - CI infrastructure failures
 *
 * Extends existing IssueCreationService for GitHub API operations.
 * Labels: severity, source, category
 * Links to: PR, file paths, CodeRabbit thread URLs
 */

import { execSync } from 'node:child_process';
import { createLogger } from '@protolabsai/utils';
import {
  EscalationSource,
  EscalationSeverity,
  type EscalationChannel,
  type EscalationSignal,
} from '@protolabsai/types';
import type { FeatureLoader } from '../feature-loader.js';

const logger = createLogger('GitHubIssueChannel');

export interface GitHubIssueChannelConfig {
  /** FeatureLoader for accessing feature data */
  featureLoader: FeatureLoader;
  /** Project path for GitHub CLI operations */
  projectPath: string;
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
    human_blocked_dependency: 'source:human-blocked-dependency',
    lead_engineer: 'source:lead-engineer',
    lead_engineer_state_machine: 'source:lead-engineer-state-machine',
    auto_mode_health_sweep: 'source:auto-mode-health-sweep',
  };
  return labelMap[source];
}

/**
 * GitHubIssueChannel implements EscalationChannel for GitHub Issues
 */
export class GitHubIssueChannel implements EscalationChannel {
  readonly name = 'github-issue';
  private config: GitHubIssueChannelConfig;
  private issuedDeduplicationKeys = new Set<string>();

  constructor(config: GitHubIssueChannelConfig) {
    this.config = config;

    // Verify gh CLI is available
    try {
      execSync('gh --version', { encoding: 'utf-8', timeout: 5000 });
      logger.info('GitHubIssueChannel initialized with gh CLI');
    } catch {
      logger.warn('gh CLI not available — GitHub issue creation will fail');
    }
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
   * Send escalation signal by creating a GitHub issue
   */
  async send(signal: EscalationSignal): Promise<void> {
    // Check if we've already created an issue for this deduplication key
    if (this.issuedDeduplicationKeys.has(signal.deduplicationKey)) {
      logger.debug(`Issue already created for deduplication key: ${signal.deduplicationKey}`);
      return;
    }

    // Search for existing issue to avoid duplicates
    const existingIssue = await this.searchExistingIssue(signal);
    if (existingIssue) {
      logger.info(`Existing issue found: ${existingIssue}, skipping creation`);
      this.issuedDeduplicationKeys.add(signal.deduplicationKey);
      return;
    }

    try {
      const title = this.buildIssueTitle(signal);
      const body = await this.buildIssueBody(signal);
      const labels = this.buildLabels(signal);

      const issueUrl = await this.createIssue(title, body, labels);

      logger.info(`Created GitHub issue for signal ${signal.type}: ${issueUrl}`);
      this.issuedDeduplicationKeys.add(signal.deduplicationKey);
    } catch (error) {
      logger.error(`Failed to create GitHub issue for signal ${signal.type}:`, error);
      throw error;
    }
  }

  /**
   * Search for existing GitHub issue matching this signal
   */
  private async searchExistingIssue(signal: EscalationSignal): Promise<string | null> {
    try {
      // Search for open issues with similar title
      const searchTerm = this.getSearchTerm(signal);
      const cmd = `gh issue list --search "${searchTerm}" --state open --limit 5 --json number,title,url`;

      const output = execSync(cmd, {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        timeout: 10_000,
      }).trim();

      if (!output) return null;

      const issues = JSON.parse(output) as Array<{
        number: number;
        title: string;
        url: string;
      }>;

      // Return first matching issue
      if (issues.length > 0) {
        return issues[0].url;
      }

      return null;
    } catch (error) {
      logger.debug('Issue search failed (not critical):', error);
      return null;
    }
  }

  /**
   * Get search term for deduplication
   */
  private getSearchTerm(signal: EscalationSignal): string {
    const featureId = signal.context.featureId as string | undefined;
    const prNumber = signal.context.prNumber as number | undefined;

    if (featureId) {
      return `[Escalation] ${signal.type} ${featureId}`;
    }

    if (prNumber) {
      return `[Escalation] ${signal.type} PR #${prNumber}`;
    }

    return `[Escalation] ${signal.type}`;
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

    // Truncate if too long (GitHub limit is 256 chars)
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
    sections.push(`This issue was automatically created by the Automaker escalation system.`);
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
   * Build issue labels
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
   * Create GitHub issue using gh CLI
   */
  private async createIssue(title: string, body: string, labels: string[]): Promise<string> {
    const labelArg = labels.join(',');

    const cmd = `gh issue create --title ${this.shellEscape(title)} --body ${this.shellEscape(body)} --label ${this.shellEscape(labelArg)}`;

    const output = execSync(cmd, {
      cwd: this.config.projectPath,
      encoding: 'utf-8',
      timeout: 30_000,
    }).trim();

    // gh issue create outputs the issue URL
    return output;
  }

  /**
   * Escape a string for safe shell usage
   */
  private shellEscape(str: string): string {
    // Use single quotes and escape any single quotes in the string
    return "'" + str.replace(/'/g, "'\\''") + "'";
  }

  /**
   * Clear deduplication cache (for testing)
   */
  clearCache(): void {
    this.issuedDeduplicationKeys.clear();
  }
}
