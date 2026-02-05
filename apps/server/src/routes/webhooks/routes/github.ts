/**
 * POST /github endpoint - GitHub webhook handler
 *
 * Handles GitHub webhook events, specifically pull_request events
 * to automatically transition features when their PRs are merged.
 */

import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../../../lib/events.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { FeatureLoader } from '../../../services/feature-loader.js';

const logger = createLogger('webhooks/github');

interface GitHubPullRequestPayload {
  action: string;
  pull_request: {
    number: number;
    title: string;
    state: string;
    merged: boolean;
    merged_at: string | null;
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

interface GitHubCheckSuitePayload {
  action: string;
  check_suite: {
    id: number;
    status: string; // 'queued' | 'in_progress' | 'completed'
    conclusion: string | null; // 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | 'stale' | null
    head_branch: string | null;
    head_sha: string;
    pull_requests: Array<{
      number: number;
      head: {
        ref: string;
      };
      base: {
        ref: string;
      };
    }>;
  };
  repository: {
    full_name: string;
    owner: {
      login: string;
    };
    name: string;
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

/**
 * Handle check_suite.completed event for auto-merge evaluation
 */
async function handleCheckSuiteEvent(
  req: Request,
  res: Response,
  events: EventEmitter,
  settingsService: SettingsService,
  featureLoader: FeatureLoader
): Promise<void> {
  const payload = req.body as GitHubCheckSuitePayload;

  // Only handle completed check suites
  if (payload.action !== 'completed') {
    logger.debug(`Ignoring check_suite action: ${payload.action}`);
    res.json({ success: true, message: 'Check suite not completed' });
    return;
  }

  const { check_suite, repository } = payload;
  const { status, conclusion, head_branch, pull_requests } = check_suite;

  logger.info(
    `Check suite completed: status=${status}, conclusion=${conclusion}, branch=${head_branch}, PRs=${pull_requests.length}`
  );

  // Only proceed if check suite was successful
  if (conclusion !== 'success') {
    logger.info(`Check suite conclusion is not success (${conclusion}), skipping auto-merge evaluation`);
    res.json({
      success: true,
      message: `Check suite conclusion: ${conclusion}`,
    });
    return;
  }

  // Get project settings
  const settings = await settingsService.getGlobalSettings();
  const currentProject = settings.projects.find((p) => p.id === settings.currentProjectId);
  const projectPath = currentProject?.path || process.cwd();

  // TODO: Get project-specific auto-merge settings once AutoMergeSettings types are available
  // Expected: const projectSettings = await settingsService.getProjectSettings(projectPath);
  // Expected: const autoMergeConfig = projectSettings.autoMerge;
  // Expected: if (!autoMergeConfig?.enabled) { return; }

  // For now, check if feature exists and log merge decision

  // Process each PR associated with the check suite
  const results = [];
  for (const pr of pull_requests) {
    const branchName = pr.head.ref;
    const prNumber = pr.number;

    // Find feature by branch name
    const feature = await findFeatureByBranch(featureLoader, projectPath, branchName);

    if (!feature) {
      logger.debug(`No feature found for PR #${prNumber} (branch: ${branchName})`);
      results.push({
        prNumber,
        branchName,
        status: 'no_feature',
      });
      continue;
    }

    // Get current feature status
    const currentFeature = await featureLoader.get(projectPath, feature.featureId);

    if (!currentFeature) {
      logger.warn(`Feature ${feature.featureId} not found`);
      results.push({
        prNumber,
        branchName,
        featureId: feature.featureId,
        status: 'feature_not_found',
      });
      continue;
    }

    // Log eligibility check (services will be integrated once they're implemented)
    logger.info(
      `Auto-merge eligibility check for PR #${prNumber} (${feature.title}): ` +
      `feature_status=${currentFeature.status}, checks=success`
    );

    // TODO: Integrate merge eligibility service once implemented
    // Expected usage:
    //   import { MergeEligibilityService } from '../../services/merge-eligibility-service.js';
    //   const mergeEligibilityService = new MergeEligibilityService();
    //   const eligibility = await mergeEligibilityService.checkEligibility(
    //     projectPath,
    //     prNumber,
    //     {
    //       featureId: feature.featureId,
    //       branchName,
    //       checksPassed: conclusion === 'success',
    //       autoMergeConfig, // from project settings
    //     }
    //   );
    //
    //   if (!eligibility.eligible) {
    //     logger.info(`PR #${prNumber} not eligible: ${eligibility.reason}`);
    //     continue;
    //   }

    // TODO: Integrate auto-merge service once implemented
    // Expected usage:
    //   import { AutoMergeService } from '../../services/auto-merge-service.js';
    //   const autoMergeService = new AutoMergeService();
    //   const mergeResult = await autoMergeService.mergePullRequest(
    //     projectPath,
    //     prNumber,
    //     {
    //       featureId: feature.featureId,
    //       method: autoMergeConfig.mergeMethod || 'squash',
    //     }
    //   );
    //
    //   if (mergeResult.success) {
    //     logger.info(`Successfully merged PR #${prNumber}`);
    //     // Emit feature:pr-merged event
    //     events.emit('feature:pr-merged', {
    //       featureId: feature.featureId,
    //       title: feature.title,
    //       prNumber,
    //       branchName,
    //       projectPath,
    //       mergedBy: 'auto-merge',
    //     });
    //   } else {
    //     logger.error(`Failed to merge PR #${prNumber}: ${mergeResult.error}`);
    //   }

    // For now, just log the decision
    logger.info(
      `Would evaluate auto-merge for PR #${prNumber}: ` +
      `feature="${feature.title}", status="${currentFeature.status}", checks=success`
    );

    results.push({
      prNumber,
      branchName,
      featureId: feature.featureId,
      featureTitle: feature.title,
      featureStatus: currentFeature.status,
      status: 'evaluated',
      // TODO: Add merge result once service is available
    });
  }

  // Emit event for logging/monitoring
  events.emit('webhook:github:check_suite', {
    repository: repository.full_name,
    conclusion,
    headBranch: head_branch,
    pullRequests: results,
    projectPath,
  });

  res.json({
    success: true,
    message: `Check suite processed for ${pull_requests.length} PR(s)`,
    results,
  });
}

export function createGitHubWebhookHandler(
  events: EventEmitter,
  settingsService: SettingsService
) {
  const featureLoader = new FeatureLoader();

  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Get webhook settings and credentials
      const settings = await settingsService.getGlobalSettings();
      const webhookConfig = settings.githubWebhook;

      // Check if webhook is enabled first (before signature validation)
      if (!webhookConfig?.enabled) {
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
      if (eventType !== 'pull_request' && eventType !== 'check_suite') {
        logger.debug(`Ignoring event type: ${eventType}`);
        res.json({ success: true, message: 'Event type not handled' });
        return;
      }

      // Route to appropriate handler
      if (eventType === 'check_suite') {
        await handleCheckSuiteEvent(req, res, events, settingsService, featureLoader);
        return;
      }

      const payload = req.body as GitHubPullRequestPayload;

      // Only handle merged PRs
      if (payload.action !== 'closed' || !payload.pull_request.merged) {
        logger.debug(`Ignoring PR action: ${payload.action}, merged: ${payload.pull_request.merged}`);
        res.json({ success: true, message: 'PR not merged' });
        return;
      }

      const branchName = payload.pull_request.head.ref;
      const prNumber = payload.pull_request.number;
      const prTitle = payload.pull_request.title;

      logger.info(`PR #${prNumber} merged: ${prTitle} (branch: ${branchName})`);

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
          message: `No feature found for branch ${branchName}`
        });
        return;
      }

      // Get current feature status
      const currentFeature = await featureLoader.get(projectPath, feature.featureId);

      if (!currentFeature) {
        logger.warn(`Feature ${feature.featureId} not found`);
        res.json({
          success: true,
          message: 'Feature not found'
        });
        return;
      }

      // Only transition if currently in review status
      if (currentFeature.status !== 'review') {
        logger.info(
          `Feature "${feature.title}" is in "${currentFeature.status}" status, not "review". Skipping transition.`
        );
        res.json({
          success: true,
          message: `Feature not in review status (current: ${currentFeature.status})`
        });
        return;
      }

      // Update feature status to done
      await featureLoader.update(projectPath, feature.featureId, {
        status: 'done',
      });

      logger.info(`Feature "${feature.title}" moved from "review" to "done" after PR #${prNumber} was merged`);

      // Emit event for UI notification
      events.emit('feature:pr-merged', {
        featureId: feature.featureId,
        title: feature.title,
        prNumber,
        prTitle,
        branchName,
        projectPath,
      });

      res.json({
        success: true,
        message: `Feature "${feature.title}" moved to done`,
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
