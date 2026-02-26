/**
 * POST /github endpoint - GitHub webhook handler
 *
 * Handles GitHub webhook events, specifically pull_request events
 * to automatically transition features when their PRs are merged.
 */

import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../../../lib/events.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { StagingPromotionService } from '../../../services/staging-promotion-service.js';

const logger = createLogger('webhooks/github');

interface GitHubPullRequestPayload {
  action: string;
  pull_request: {
    number: number;
    title: string;
    state: string;
    merged: boolean;
    merged_at: string | null;
    merge_commit_sha: string | null;
    head: {
      ref: string; // branch name
    };
    base: {
      ref: string;
    };
  };
  repository: {
    full_name: string;
  };
}

interface GitHubIssuePayload {
  action: string;
  issue: {
    number: number;
    title: string;
    body: string | null;
    state: string;
    created_at: string;
    user: {
      login: string;
    };
  };
  repository: {
    full_name: string;
  };
}

/**
 * Verify GitHub webhook signature
 */
function verifySignature(secret: string, signature: string | undefined, body: string): boolean {
  if (!signature) {
    return false;
  }

  // GitHub sends signature as "sha256=<hash>"
  const parts = signature.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const hash = createHmac('sha256', secret).update(body).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(parts[1]));
  } catch {
    return false;
  }
}

/**
 * Find feature by branch name
 */
async function findFeatureByBranch(
  featureLoader: FeatureLoader,
  projectPath: string,
  branchName: string
): Promise<{ featureId: string; title: string } | null> {
  try {
    const features = await featureLoader.getAll(projectPath);
    const match = features.find((f) => f.branchName === branchName);

    if (match) {
      return { featureId: match.id, title: match.title || match.id };
    }

    return null;
  } catch (error) {
    logger.error('Error finding feature by branch:', error);
    return null;
  }
}

export function createGitHubWebhookHandler(events: EventEmitter, settingsService: SettingsService) {
  const featureLoader = new FeatureLoader();
  const stagingPromotionService = new StagingPromotionService();

  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Get webhook settings and credentials
      const settings = await settingsService.getGlobalSettings();
      const webhookConfig = settings.githubWebhook;

      // Check if webhook is explicitly disabled. Defaults to enabled when not configured,
      // since the endpoint is protected by HMAC signature verification.
      if (webhookConfig?.enabled === false) {
        logger.debug('GitHub webhook is disabled');
        res.status(403).json({
          success: false,
          error: 'GitHub webhook integration is disabled',
        });
        return;
      }

      // Verify signature if secret is configured in credentials
      const credentials = await settingsService.getCredentials();
      const webhookSecret = credentials.webhookSecrets?.github;

      if (webhookSecret) {
        const signature = req.headers['x-hub-signature-256'] as string | undefined;
        const body = JSON.stringify(req.body);

        if (!verifySignature(webhookSecret, signature, body)) {
          logger.warn('GitHub webhook signature verification failed');
          res.status(401).json({
            success: false,
            error: 'Invalid signature',
          });
          return;
        }
      } else {
        logger.warn('GitHub webhook secret not configured - requests will not be verified');
      }

      // Check event type
      const eventType = req.headers['x-github-event'] as string | undefined;
      if (
        eventType !== 'pull_request' &&
        eventType !== 'pull_request_review' &&
        eventType !== 'issues'
      ) {
        logger.debug(`Ignoring event: ${eventType}`);
        res.json({ success: true, message: 'Event type not handled' });
        return;
      }

      // Handle issues events (created)
      if (eventType === 'issues') {
        const issuePayload = req.body as GitHubIssuePayload;

        if (issuePayload.action === 'opened') {
          logger.info(
            `GitHub issue #${issuePayload.issue.number} created: ${issuePayload.issue.title}`
          );

          // Emit issue detected event for signal intake
          events.emit('webhook:github:issue', {
            action: 'opened',
            issueNumber: issuePayload.issue.number,
            title: issuePayload.issue.title,
            body: issuePayload.issue.body || '',
            author: issuePayload.issue.user.login,
            createdAt: issuePayload.issue.created_at,
            repository: issuePayload.repository.full_name,
          });
        }

        res.json({ success: true, message: 'Issue event processed' });
        return;
      }

      const payload = req.body as GitHubPullRequestPayload;

      // Handle pull_request_review events (changes requested / approved)
      if (eventType === 'pull_request_review') {
        const reviewPayload = req.body as {
          action: string;
          review: { state: string; body: string; user: { login: string } };
          pull_request: { number: number; head: { ref: string } };
        };

        if (reviewPayload.action === 'submitted') {
          const branchName = reviewPayload.pull_request.head.ref;
          const prNumber = reviewPayload.pull_request.number;
          const reviewState = reviewPayload.review.state;

          logger.info(
            `PR #${prNumber} review: ${reviewState} by ${reviewPayload.review.user?.login}`
          );

          // Emit webhook event for PR feedback service to pick up
          events.emit('webhook:github:pull_request', {
            action: 'review_submitted',
            prNumber,
            branchName,
            reviewState,
            reviewBody: reviewPayload.review.body,
            reviewer: reviewPayload.review.user?.login,
          });
        }

        res.json({ success: true, message: 'Review event processed' });
        return;
      }

      // Only handle merged PRs for pull_request events
      if (payload.action !== 'closed' || !payload.pull_request.merged) {
        logger.debug(
          `Ignoring PR action: ${payload.action}, merged: ${payload.pull_request.merged}`
        );
        res.json({ success: true, message: 'PR not merged' });
        return;
      }

      const branchName = payload.pull_request.head.ref;
      const baseBranch = payload.pull_request.base.ref;
      const mergeCommitSha = payload.pull_request.merge_commit_sha ?? '';
      const prNumber = payload.pull_request.number;
      const prTitle = payload.pull_request.title;

      logger.info(`PR #${prNumber} merged: ${prTitle} (branch: ${branchName} → ${baseBranch})`);

      // Get project path from settings or use current working directory
      // In a real implementation, you might want to match the repository to a project
      const currentProject = settings.projects.find((p) => p.id === settings.currentProjectId);
      const projectPath = currentProject?.path || process.cwd();

      // Find feature by branch name
      const feature = await findFeatureByBranch(featureLoader, projectPath, branchName);

      if (!feature) {
        logger.info(`No feature found for branch: ${branchName}`);
        res.json({
          success: true,
          message: `No feature found for branch ${branchName}`,
        });
        return;
      }

      // Get current feature status
      const currentFeature = await featureLoader.get(projectPath, feature.featureId);

      if (!currentFeature) {
        logger.warn(`Feature ${feature.featureId} not found`);
        res.json({
          success: true,
          message: 'Feature not found',
        });
        return;
      }

      // Track whether the feature was already marked done before this event
      const wasAlreadyDone = currentFeature.status === 'done';

      if (wasAlreadyDone) {
        logger.info(
          `Feature "${feature.title}" is already in "done" status. PR #${prNumber} merge confirmed.`
        );
      } else {
        // Update feature status to done
        await featureLoader.update(projectPath, feature.featureId, {
          status: 'done',
        });

        logger.info(
          `Feature "${feature.title}" moved from "${currentFeature.status}" to "done" after PR #${prNumber} was merged`
        );

        // Emit event for UI notification
        events.emit('feature:pr-merged', {
          featureId: feature.featureId,
          title: feature.title,
          prNumber,
          prTitle,
          branchName,
          projectPath,
        });
      }

      // Dev-merge detection: create a staging promotion candidate when the PR
      // targets the dev branch and autoCandidateOnDevMerge is enabled.
      if (baseBranch === 'dev') {
        const shouldCreate = stagingPromotionService.detectDevMerge(
          { id: feature.featureId, title: feature.title, branchName },
          mergeCommitSha
        );

        if (shouldCreate && settings.promotion?.autoCandidateOnDevMerge) {
          const candidate = await stagingPromotionService.createCandidate(
            projectPath,
            feature.featureId,
            mergeCommitSha,
            feature.title,
            branchName
          );
          logger.info(
            `Staging promotion candidate created for feature "${feature.featureId}" (commit: ${candidate.commitSha})`
          );
        }
      }

      res.json({
        success: true,
        message: wasAlreadyDone
          ? `Feature already marked as done`
          : `Feature "${feature.title}" moved to done`,
        featureId: feature.featureId,
      });
    } catch (error) {
      logger.error('GitHub webhook handler error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
