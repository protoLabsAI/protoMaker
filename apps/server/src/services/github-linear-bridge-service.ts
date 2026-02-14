/**
 * GitHub → Linear Bridge Service
 *
 * Subscribes to PR lifecycle events (changes-requested, approved, ci-failure)
 * and posts formatted comments to the corresponding Linear issues.
 *
 * This bridges the gap where GitHub PR state is invisible in Linear.
 * PRFeedbackService emits the events; this service consumes them.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import { LinearMCPClient } from './linear-mcp-client.js';

const logger = createLogger('GitHubLinearBridge');

/** Tracks posted comments to avoid duplicates within a time window */
interface PostedComment {
  featureId: string;
  eventType: string;
  timestamp: number;
}

/** PR event payloads from PRFeedbackService */
interface PRChangesRequestedPayload {
  projectPath: string;
  featureId: string;
  prNumber: number;
  prUrl?: string;
  branchName?: string;
  iterationCount?: number;
  feedback?: string;
  reviewers?: string[];
}

interface PRApprovedPayload {
  projectPath: string;
  featureId: string;
  prNumber: number;
  prUrl?: string;
  branchName?: string;
  approvers?: string[];
  detectionMethod?: string;
}

interface PRCIFailurePayload {
  projectPath: string;
  prNumber: number;
  headBranch: string;
  headSha?: string;
  checkSuiteId?: number;
  checkSuiteUrl?: string | null;
  repository?: string;
  checksUrl?: string;
  featureId?: string;
}

interface PRFeedbackReceivedPayload {
  projectPath: string;
  featureId: string;
  prNumber: number;
  type: 'changes_requested' | 'commented';
  iterationCount?: number;
  detectionMethod?: string;
  actionable?: boolean;
}

/** Deduplication window (5 minutes) */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** Max comment history for dedup */
const MAX_COMMENT_HISTORY = 200;

export class GitHubLinearBridgeService {
  private emitter: EventEmitter | null = null;
  private featureLoader: FeatureLoader | null = null;
  private settingsService: SettingsService | null = null;
  private unsubscribe: (() => void) | null = null;
  private recentComments: PostedComment[] = [];
  private initialized = false;

  initialize(
    emitter: EventEmitter,
    featureLoader: FeatureLoader,
    settingsService: SettingsService
  ): void {
    if (this.initialized) return;

    this.emitter = emitter;
    this.featureLoader = featureLoader;
    this.settingsService = settingsService;

    this.unsubscribe = emitter.subscribe((type, payload) => {
      if (type === 'pr:changes-requested') {
        void this.onChangesRequested(payload as PRChangesRequestedPayload);
      } else if (type === 'pr:approved') {
        void this.onApproved(payload as PRApprovedPayload);
      } else if (type === 'pr:ci-failure') {
        void this.onCIFailure(payload as PRCIFailurePayload);
      }
    });

    this.initialized = true;
    logger.info('GitHubLinearBridgeService initialized');
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.emitter = null;
    this.featureLoader = null;
    this.settingsService = null;
    this.recentComments = [];
    this.initialized = false;
  }

  /**
   * Handle PR changes requested — post comment to Linear issue
   */
  private async onChangesRequested(payload: PRChangesRequestedPayload): Promise<void> {
    const { projectPath, featureId, prNumber, reviewers, feedback } = payload;

    if (this.isDuplicate(featureId, 'changes-requested')) return;

    try {
      const linearIssueId = await this.getLinearIssueId(projectPath, featureId);
      if (!linearIssueId) return;

      const reviewerList = reviewers?.length ? reviewers.join(', ') : 'a reviewer';

      let comment = `🔄 **Changes Requested** on PR #${prNumber} by ${reviewerList}`;

      if (feedback) {
        // Truncate feedback to keep comment reasonable
        const truncated = feedback.length > 500 ? feedback.substring(0, 500) + '...' : feedback;
        comment += `\n\n> ${truncated.replace(/\n/g, '\n> ')}`;
      }

      await this.postComment(projectPath, linearIssueId, comment);
      this.recordComment(featureId, 'changes-requested');

      logger.info(`Posted changes-requested comment to Linear for feature ${featureId}`);
    } catch (error) {
      logger.error(`Failed to bridge changes-requested for feature ${featureId}:`, error);
    }
  }

  /**
   * Handle PR approved — post comment to Linear issue
   */
  private async onApproved(payload: PRApprovedPayload): Promise<void> {
    const { projectPath, featureId, prNumber, approvers } = payload;

    if (this.isDuplicate(featureId, 'approved')) return;

    try {
      const linearIssueId = await this.getLinearIssueId(projectPath, featureId);
      if (!linearIssueId) return;

      const approverList = approvers?.length ? approvers.join(', ') : 'a reviewer';

      const comment = `✅ **PR Approved** — PR #${prNumber} approved by ${approverList}. Ready to merge.`;

      await this.postComment(projectPath, linearIssueId, comment);
      this.recordComment(featureId, 'approved');

      logger.info(`Posted approved comment to Linear for feature ${featureId}`);
    } catch (error) {
      logger.error(`Failed to bridge approved for feature ${featureId}:`, error);
    }
  }

  /**
   * Handle CI failure — post comment to Linear issue
   */
  private async onCIFailure(payload: PRCIFailurePayload): Promise<void> {
    const { projectPath, prNumber, headBranch, featureId: payloadFeatureId } = payload;

    // CI failure events may not include featureId — look it up by branch
    let featureId: string | undefined = payloadFeatureId;
    if (!featureId) {
      featureId = (await this.findFeatureByBranch(projectPath, headBranch)) ?? undefined;
      if (!featureId) {
        logger.debug(`No feature found for branch ${headBranch}, skipping CI failure bridge`);
        return;
      }
    }

    if (this.isDuplicate(featureId, 'ci-failure')) return;

    try {
      const linearIssueId = await this.getLinearIssueId(projectPath, featureId);
      if (!linearIssueId) return;

      const comment = `❌ **CI Failed** on PR #${prNumber} (branch: \`${headBranch}\`). Build or tests are failing.`;

      await this.postComment(projectPath, linearIssueId, comment);
      this.recordComment(featureId, 'ci-failure');

      logger.info(`Posted ci-failure comment to Linear for feature ${featureId}`);
    } catch (error) {
      logger.error(`Failed to bridge ci-failure for feature ${featureId}:`, error);
    }
  }

  /**
   * Get the Linear issue ID for a feature
   */
  private async getLinearIssueId(projectPath: string, featureId: string): Promise<string | null> {
    if (!this.featureLoader) return null;

    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature?.linearIssueId) {
        logger.debug(`Feature ${featureId} has no Linear issue ID, skipping bridge`);
        return null;
      }
      return feature.linearIssueId;
    } catch (error) {
      logger.error(`Failed to load feature ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Find a feature by its branch name
   */
  private async findFeatureByBranch(
    projectPath: string,
    branchName: string
  ): Promise<string | null> {
    if (!this.featureLoader) return null;

    try {
      const features = await this.featureLoader.getAll(projectPath);
      const feature = features.find((f) => f.branchName === branchName);
      return feature?.id ?? null;
    } catch (error) {
      logger.debug(`Failed to find feature by branch ${branchName}:`, error);
      return null;
    }
  }

  /**
   * Post a comment to a Linear issue
   */
  private async postComment(
    projectPath: string,
    linearIssueId: string,
    body: string
  ): Promise<void> {
    if (!this.settingsService) {
      logger.error('SettingsService not initialized');
      return;
    }

    const client = new LinearMCPClient(this.settingsService, projectPath);

    try {
      await client.addComment({
        issueId: linearIssueId,
        body,
      });
    } catch (error) {
      // Don't let comment failures break the service
      logger.warn(`Failed to post comment to Linear issue ${linearIssueId}:`, error);
    }
  }

  /**
   * Check if a comment was recently posted for this feature+event combo
   */
  private isDuplicate(featureId: string, eventType: string): boolean {
    const now = Date.now();
    const recent = this.recentComments.find(
      (c) =>
        c.featureId === featureId &&
        c.eventType === eventType &&
        now - c.timestamp < DEDUP_WINDOW_MS
    );

    if (recent) {
      logger.debug(`Skipping duplicate ${eventType} comment for feature ${featureId}`);
      return true;
    }
    return false;
  }

  /**
   * Record a posted comment for deduplication
   */
  private recordComment(featureId: string, eventType: string): void {
    this.recentComments.push({
      featureId,
      eventType,
      timestamp: Date.now(),
    });

    // Trim old entries
    if (this.recentComments.length > MAX_COMMENT_HISTORY) {
      const cutoff = Date.now() - DEDUP_WINDOW_MS;
      this.recentComments = this.recentComments.filter((c) => c.timestamp > cutoff);
    }
  }
}

/** Singleton instance */
export const githubLinearBridgeService = new GitHubLinearBridgeService();
