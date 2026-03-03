/**
 * Issue Creation Service - Failure-to-Issue Pipeline
 *
 * Listens for failure events and automatically creates GitHub issues
 * with full diagnostic context. Posts notifications to Discord #bugs-and-issues.
 *
 * Triggers:
 * - feature:permanently-blocked (retryCount >= 3, from ReconciliationService)
 * - recovery_escalated (from RecoveryService)
 * - pr:ci-failure (persistent CI failures)
 */

import { execSync } from 'node:child_process';
import { createLogger } from '@protolabs-ai/utils';
import type { FailureCategory } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { TriageService, TriageInput, TriageResult } from './triage-service.js';
import type { SettingsService } from './settings-service.js';
import type { Feature } from '@protolabs-ai/types';

const logger = createLogger('IssueCreationService');

const FAILURE_CATEGORIES: readonly string[] = [
  'transient',
  'rate_limit',
  'authentication',
  'quota',
  'test_failure',
  'dependency',
  'tool_error',
  'merge_conflict',
  'validation',
  'unknown',
];

function isFailureCategory(value: unknown): value is FailureCategory {
  return typeof value === 'string' && FAILURE_CATEGORIES.includes(value);
}

/** Discord channel ID for #bugs-and-issues (fallback from env) */
const ENV_BUGS_CHANNEL_ID = process.env.DISCORD_BUGS_CHANNEL_ID || '';

interface IssueCreationResult {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}

/**
 * Payload for feature:permanently-blocked event
 */
interface PermanentlyBlockedPayload {
  projectPath: string;
  featureId: string;
  retryCount: number;
  lastError?: string;
  failureCategory?: string;
}

/**
 * Payload for recovery_escalated event
 */
interface RecoveryEscalatedPayload {
  featureId: string;
  reason: string;
  timestamp: string;
  projectPath?: string;
}

/**
 * Payload for pr:ci-failure event
 */
interface CIFailurePayload {
  projectPath: string;
  featureId?: string;
  prNumber?: number;
  failedChecks?: Array<{ name: string; conclusion: string }>;
}

export class IssueCreationService {
  private events: EventEmitter;
  private featureLoader: FeatureLoader;
  private triageService: TriageService;
  private settingsService: SettingsService;
  private unsubscribe: (() => void) | null = null;
  private initialized = false;
  /**
   * Track which features already have issues to avoid duplicates within this session.
   * Persistent fallback: also checks feature.githubIssueNumber after restarts.
   */
  private issuedFeatures = new Set<string>();

  constructor(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    triageService: TriageService,
    settingsService: SettingsService
  ) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.triageService = triageService;
    this.settingsService = settingsService;
  }

  /**
   * Start listening for failure events
   */
  initialize(): void {
    if (this.initialized) return;

    // Verify gh CLI is available before subscribing to events
    try {
      execSync('gh --version', { encoding: 'utf-8', timeout: 5000 });
    } catch {
      logger.warn('gh CLI not available — issue creation will be disabled');
      return;
    }

    this.initialized = true;

    this.unsubscribe = this.events.subscribe((type, payload) => {
      switch (type) {
        case 'feature:permanently-blocked':
          void this.handlePermanentlyBlocked(payload as PermanentlyBlockedPayload);
          break;
        case 'recovery_escalated':
          void this.handleRecoveryEscalated(payload as RecoveryEscalatedPayload);
          break;
        case 'pr:ci-failure':
          void this.handleCIFailure(payload as CIFailurePayload);
          break;
      }
    });

    logger.info('Issue creation service initialized');
  }

  /**
   * Stop listening for events
   */
  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.initialized = false;
  }

  /**
   * Handle feature that has exceeded max retries
   */
  private async handlePermanentlyBlocked(payload: PermanentlyBlockedPayload): Promise<void> {
    const { projectPath, featureId, retryCount, lastError, failureCategory } = payload;

    // Avoid duplicate issues
    if (this.issuedFeatures.has(featureId)) {
      logger.info(`Issue already created for feature ${featureId}, skipping`);
      return;
    }

    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature) {
      logger.warn(`Feature ${featureId} not found, cannot create issue`);
      return;
    }

    // Skip if feature already has a GitHub issue
    if (feature.githubIssueNumber) {
      logger.info(`Feature ${featureId} already has issue #${feature.githubIssueNumber}`);
      this.issuedFeatures.add(featureId);
      return;
    }

    const triageInput: TriageInput = {
      featureId,
      projectPath,
      failureCategory: isFailureCategory(failureCategory) ? failureCategory : undefined,
      retryCount,
      error: lastError,
    };

    const triage = this.triageService.triage(triageInput);

    const result = await this.createGitHubIssue(projectPath, feature, {
      retryCount,
      lastError,
      failureCategory,
      triage,
      trigger: 'max-retries',
    });

    if (result.success && result.issueNumber) {
      this.issuedFeatures.add(featureId);
      await this.featureLoader.update(projectPath, featureId, {
        githubIssueNumber: result.issueNumber,
        githubIssueUrl: result.issueUrl,
      });
      await this.postDiscordNotification(feature, result, triage, projectPath);
    }
  }

  /**
   * Handle recovery escalation to user
   */
  private async handleRecoveryEscalated(payload: RecoveryEscalatedPayload): Promise<void> {
    const { featureId, reason, projectPath } = payload;

    if (!projectPath) {
      logger.warn('recovery_escalated missing projectPath, cannot create issue');
      return;
    }

    if (this.issuedFeatures.has(featureId)) {
      return;
    }

    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature) return;

    if (feature.githubIssueNumber) {
      this.issuedFeatures.add(featureId);
      return;
    }

    const triageInput: TriageInput = {
      featureId,
      projectPath,
      error: reason,
    };

    const triage = this.triageService.triage(triageInput);

    const result = await this.createGitHubIssue(projectPath, feature, {
      lastError: reason,
      triage,
      trigger: 'recovery-escalated',
    });

    if (result.success && result.issueNumber) {
      this.issuedFeatures.add(featureId);
      await this.featureLoader.update(projectPath, featureId, {
        githubIssueNumber: result.issueNumber,
        githubIssueUrl: result.issueUrl,
      });
      await this.postDiscordNotification(feature, result, triage, projectPath);
    }
  }

  /**
   * Handle persistent CI failure
   */
  private async handleCIFailure(payload: CIFailurePayload): Promise<void> {
    const { projectPath, featureId, prNumber, failedChecks } = payload;

    if (!featureId) return;

    if (this.issuedFeatures.has(featureId)) {
      return;
    }

    const feature = await this.featureLoader.get(projectPath, featureId);
    if (!feature) return;

    if (feature.githubIssueNumber) {
      this.issuedFeatures.add(featureId);
      return;
    }

    const triageInput: TriageInput = {
      featureId,
      projectPath,
      isCIFailure: true,
      error: failedChecks?.map((c) => `${c.name}: ${c.conclusion}`).join(', '),
    };

    const triage = this.triageService.triage(triageInput);

    const result = await this.createGitHubIssue(projectPath, feature, {
      prNumber,
      failedChecks,
      triage,
      trigger: 'ci-failure',
    });

    if (result.success && result.issueNumber) {
      this.issuedFeatures.add(featureId);
      await this.featureLoader.update(projectPath, featureId, {
        githubIssueNumber: result.issueNumber,
        githubIssueUrl: result.issueUrl,
      });
      await this.postDiscordNotification(feature, result, triage, projectPath);
    }
  }

  /**
   * Create a GitHub issue with full diagnostic context
   */
  private async createGitHubIssue(
    projectPath: string,
    feature: Feature,
    context: {
      retryCount?: number;
      lastError?: string;
      failureCategory?: string;
      prNumber?: number;
      failedChecks?: Array<{ name: string; conclusion: string }>;
      triage: TriageResult;
      trigger: 'max-retries' | 'recovery-escalated' | 'ci-failure';
    }
  ): Promise<IssueCreationResult> {
    try {
      const title = this.buildIssueTitle(feature, context.trigger);
      const body = this.buildIssueBody(feature, context);
      const labels = context.triage.labels.join(',');

      // Use gh CLI to create the issue
      const cmd = `gh issue create --title ${this.shellEscape(title)} --body ${this.shellEscape(body)} --label ${this.shellEscape(labels)}`;

      const output = execSync(cmd, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30_000,
      }).trim();

      // gh issue create outputs the issue URL
      const issueUrl = output;
      const issueNumberMatch = issueUrl.match(/\/issues\/(\d+)$/);
      const issueNumber = issueNumberMatch ? parseInt(issueNumberMatch[1], 10) : undefined;

      logger.info(`Created GitHub issue for feature ${feature.id}: ${issueUrl}`);

      this.events.emit('issue:created', {
        featureId: feature.id,
        projectPath,
        issueNumber,
        issueUrl,
        trigger: context.trigger,
        priority: context.triage.priority,
        team: context.triage.team,
        timestamp: Date.now(),
      });

      return { success: true, issueNumber, issueUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create GitHub issue for feature ${feature.id}:`, error);
      return { success: false, error: message };
    }
  }

  /**
   * Build issue title
   */
  private buildIssueTitle(feature: Feature, trigger: string): string {
    const featureTitle = feature.title || feature.id;
    switch (trigger) {
      case 'max-retries':
        return `[Auto] Feature blocked after max retries: ${featureTitle}`;
      case 'recovery-escalated':
        return `[Auto] Recovery escalated: ${featureTitle}`;
      case 'ci-failure':
        return `[Auto] CI failure: ${featureTitle}`;
      default:
        return `[Auto] Issue: ${featureTitle}`;
    }
  }

  /**
   * Build issue body with full diagnostic context
   */
  private buildIssueBody(
    feature: Feature,
    context: {
      retryCount?: number;
      lastError?: string;
      failureCategory?: string;
      prNumber?: number;
      failedChecks?: Array<{ name: string; conclusion: string }>;
      triage: TriageResult;
      trigger: string;
    }
  ): string {
    const sections: string[] = [];

    // Header
    sections.push('## Auto-generated Issue');
    sections.push('');
    sections.push(`This issue was automatically created by Automaker's failure-to-issue pipeline.`);
    sections.push('');

    // Feature details
    sections.push('### Feature Details');
    sections.push('');
    sections.push(`| Field | Value |`);
    sections.push(`|-------|-------|`);
    sections.push(`| **Feature ID** | \`${feature.id}\` |`);
    sections.push(`| **Title** | ${feature.title || 'N/A'} |`);
    sections.push(`| **Status** | ${feature.status || 'unknown'} |`);
    sections.push(`| **Branch** | ${feature.branchName ? `\`${feature.branchName}\`` : 'N/A'} |`);
    if (context.retryCount !== undefined) {
      sections.push(`| **Retry Count** | ${context.retryCount} |`);
    }
    if (context.failureCategory) {
      sections.push(`| **Failure Category** | ${context.failureCategory} |`);
    }
    if (feature.prNumber) {
      sections.push(`| **PR** | #${feature.prNumber} |`);
    }
    sections.push('');

    // Triage
    sections.push('### Triage');
    sections.push('');
    sections.push(`- **Priority**: ${context.triage.priorityLabel}`);
    sections.push(`- **Team**: ${context.triage.team}`);
    sections.push(`- **Reason**: ${context.triage.reason}`);
    sections.push('');

    // Error details
    if (context.lastError) {
      sections.push('### Last Error');
      sections.push('');
      sections.push('```');
      sections.push(context.lastError.slice(0, 2000));
      sections.push('```');
      sections.push('');
    }

    // CI failures
    if (context.failedChecks && context.failedChecks.length > 0) {
      sections.push('### Failed CI Checks');
      sections.push('');
      for (const check of context.failedChecks) {
        sections.push(`- **${check.name}**: ${check.conclusion}`);
      }
      sections.push('');
    }

    // Description
    if (feature.description) {
      sections.push('### Feature Description');
      sections.push('');
      sections.push(feature.description.slice(0, 1000));
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Post notification to Discord #bugs-and-issues channel
   */
  /**
   * Resolve bugs channel ID from integration config, falling back to env var.
   */
  private async getBugsChannelId(projectPath: string): Promise<string> {
    try {
      const projectSettings = await this.settingsService.getProjectSettings(projectPath);
      return projectSettings?.integrations?.discord?.channels?.bugs || ENV_BUGS_CHANNEL_ID;
    } catch {
      return ENV_BUGS_CHANNEL_ID;
    }
  }

  private async postDiscordNotification(
    feature: Feature,
    result: IssueCreationResult,
    triage: TriageResult,
    projectPath?: string
  ): Promise<void> {
    const bugsChannelId = projectPath
      ? await this.getBugsChannelId(projectPath)
      : ENV_BUGS_CHANNEL_ID;
    if (!bugsChannelId) {
      logger.debug('No bugs channel configured, skipping Discord notification');
      return;
    }

    try {
      const priorityEmoji =
        triage.priority === 1
          ? '🔴'
          : triage.priority === 2
            ? '🟠'
            : triage.priority === 3
              ? '🟡'
              : '🟢';
      const message = [
        `${priorityEmoji} **New Issue Created**: ${feature.title || feature.id}`,
        `**Priority**: ${triage.priorityLabel} | **Team**: ${triage.team}`,
        `**Reason**: ${triage.reason}`,
        result.issueUrl ? `**GitHub**: ${result.issueUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      this.events.emit('integration:discord', {
        action: 'send_message',
        channelId: bugsChannelId,
        content: message,
      });
    } catch (error) {
      logger.warn('Failed to post Discord notification:', error);
    }
  }

  /**
   * Escape a string for safe shell usage
   */
  private shellEscape(str: string): string {
    // Use $'...' syntax for proper escaping
    return "'" + str.replace(/'/g, "'\\''") + "'";
  }
}
