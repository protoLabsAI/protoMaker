/**
 * POST /github endpoint - GitHub webhook handler
 *
 * Handles GitHub webhook events, specifically pull_request events
 * to automatically transition features when their PRs are merged.
 * Also handles check_suite and check_run CI events on this global route,
 * mirroring the per-project route at /github/webhook.
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import { verifyWebhookSignature } from '../../../lib/webhook-signature.js';
import type { WebhookSecrets } from '../../../lib/webhook-signature.js';

const execAsync = promisify(exec);
import type { EventEmitter } from '../../../lib/events.js';
import type { TopicBus } from '../../../lib/topic-bus.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { StagingPromotionService } from '../../../services/staging-promotion-service.js';
import { getPRWatcherService } from '../../../services/pr-watcher-service.js';
import type {
  GitHubCheckSuiteWebhookPayload,
  GitHubCheckRunWebhookPayload,
} from '@protolabsai/types';

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

interface GitHubIssueCommentPayload {
  action: string;
  issue: {
    number: number;
    title: string;
  };
  comment: {
    id: number;
    body: string;
    user: {
      login: string;
    };
    created_at: string;
  };
  repository: {
    full_name: string;
  };
}

// Webhook signature verification is handled by the shared utility
// in lib/webhook-signature.ts (verifyWebhookSignature with dual-secret support)

/**
 * After a PR merges, update all other open PRs targeting the same base branch
 * so they stay current and don't go CONFLICTING. Uses GitHub's update-branch
 * API (equivalent to the "Update branch" button in the UI).
 *
 * Runs fire-and-forget — failures are logged but never block the webhook response.
 */
async function cascadeUpdateBranches(
  repoFullName: string,
  baseBranch: string,
  mergedPrNumber: number
): Promise<void> {
  try {
    const { stdout } = await execAsync(
      `gh pr list --repo ${repoFullName} --base ${baseBranch} --state open --json number --limit 50`
    );

    const openPRs = JSON.parse(stdout) as Array<{ number: number }>;
    const siblingsToUpdate = openPRs.filter((pr) => pr.number !== mergedPrNumber);

    if (siblingsToUpdate.length === 0) {
      return;
    }

    logger.info(
      `Cascade rebase: updating ${siblingsToUpdate.length} open PR(s) targeting ${baseBranch} after PR #${mergedPrNumber} merged`
    );

    // Update branches sequentially to avoid GitHub API rate limits
    for (const pr of siblingsToUpdate) {
      try {
        await execAsync(
          `gh api repos/${repoFullName}/pulls/${pr.number}/update-branch --method PUT -f update_method=rebase`
        );
        logger.info(`Cascade rebase: updated PR #${pr.number} branch`);
      } catch (err) {
        // update-branch fails if there are conflicts — that's expected and non-fatal.
        // The PR will show as CONFLICTING in the UI and require manual resolution.
        logger.debug(
          `Cascade rebase: could not update PR #${pr.number} (may have conflicts): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    logger.warn(
      `Cascade rebase: failed to list open PRs for ${baseBranch}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Scan all configured projects to find the one whose features satisfy `matcher`.
 * Returns the project path on first match, or null if none match.
 */
async function findProjectPathForFeature(
  featureLoader: FeatureLoader,
  projects: Array<{ path?: string }>,
  matcher: (path: string) => Promise<boolean>
): Promise<string | null> {
  for (const project of projects) {
    if (!project.path) continue;
    try {
      if (await matcher(project.path)) return project.path;
    } catch {
      /* continue to next project */
    }
  }
  return null;
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
 * Handle check_suite completed event on the global webhook route.
 *
 * Mirrors handleCheckSuiteEvent from the per-project route at
 * apps/server/src/routes/github/routes/webhook.ts. The projectPath is
 * resolved to process.cwd() since this route is not project-scoped.
 * Deduplication happens downstream in PRFeedbackService via lastCheckSuiteId.
 */
async function handleGlobalCheckSuiteEvent(
  payload: GitHubCheckSuiteWebhookPayload,
  events: EventEmitter,
  topicBus?: TopicBus
): Promise<void> {
  const { action, check_suite, repository } = payload;

  logger.info(
    `[global] check_suite event: ${action} on ${repository.full_name} (conclusion: ${check_suite.conclusion})`
  );

  // Only process completed check suites with failure conclusion
  if (action !== 'completed' || check_suite.conclusion !== 'failure') {
    return;
  }

  // Only process if there are associated PRs
  if (!check_suite.pull_requests || check_suite.pull_requests.length === 0) {
    logger.debug(`[global] Check suite ${check_suite.id} has no associated PRs, ignoring`);
    return;
  }

  // Emit CI failure event for each associated PR.
  // projectPath is left as empty string — PRFeedbackService resolves it
  // from the tracked PR registry via prNumber.
  for (const pr of check_suite.pull_requests) {
    logger.info(
      `[global] CI failure detected for PR #${pr.number} (check_suite: ${check_suite.id}, sha: ${check_suite.head_sha})`
    );

    events.emit('pr:ci-failure', {
      projectPath: '',
      prNumber: pr.number,
      headBranch: pr.head.ref,
      headSha: check_suite.head_sha,
      checkSuiteId: check_suite.id,
      checkSuiteUrl: check_suite.url,
      repository: repository.full_name,
      checksUrl: check_suite.check_runs_url,
    });

    // Publish to TopicBus (hierarchical routing)
    if (topicBus) {
      topicBus.publish(`pr.checks.${pr.number}.ci-failure`, {
        prNumber: pr.number,
        headBranch: pr.head.ref,
        headSha: check_suite.head_sha,
        checkSuiteId: check_suite.id,
        repository: repository.full_name,
      });
    }
  }
}

/**
 * Handle check_run completed event on the global webhook route.
 *
 * Mirrors handleCheckRunEvent from the per-project route. Uses PRWatcherService
 * to trigger fast-path checks for watched PRs.
 */
async function handleGlobalCheckRunEvent(
  payload: GitHubCheckRunWebhookPayload,
  events: EventEmitter
): Promise<void> {
  const { action, check_run } = payload;

  // Only react to completed check runs
  if (action !== 'completed') return;

  const prs = check_run.pull_requests ?? [];
  if (prs.length === 0) return;

  const watcher = getPRWatcherService(events);
  if (!watcher) return;

  for (const pr of prs) {
    if (watcher.isWatching(pr.number)) {
      logger.info(
        `[global] check_run completed for PR #${pr.number} (${check_run.name}) — triggering watcher check`
      );
      await watcher.triggerCheck(pr.number);
    }
  }

  logger.debug(`[global] Processed check_run ${check_run.id} (${check_run.name})`);
}

export function createGitHubWebhookHandler(
  events: EventEmitter,
  settingsService: SettingsService,
  topicBus?: TopicBus
) {
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

        // Build secrets object with optional previous secret for rotation support
        const secrets: WebhookSecrets = {
          current: webhookSecret,
          previous: credentials.webhookSecrets?.previousGithub,
          previousExpiresAt: credentials.webhookSecrets?.previousGithubExpiresAt,
        };

        const verification = verifyWebhookSignature(body, signature, secrets);
        if (!verification.valid) {
          logger.warn(`GitHub webhook signature verification failed: ${verification.error}`);
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

      // Handle check_suite events — CI failure routing
      if (eventType === 'check_suite') {
        await handleGlobalCheckSuiteEvent(
          req.body as GitHubCheckSuiteWebhookPayload,
          events,
          topicBus
        );
        res.json({ success: true, message: 'check_suite event processed' });
        return;
      }

      // Handle check_run events — fast-path PRWatcher trigger
      if (eventType === 'check_run') {
        await handleGlobalCheckRunEvent(req.body as GitHubCheckRunWebhookPayload, events);
        res.json({ success: true, message: 'check_run event processed' });
        return;
      }

      if (
        eventType !== 'pull_request' &&
        eventType !== 'pull_request_review' &&
        eventType !== 'issues' &&
        eventType !== 'issue_comment'
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

      // Handle issue_comment events (created)
      if (eventType === 'issue_comment') {
        const commentPayload = req.body as GitHubIssueCommentPayload;

        if (commentPayload.action === 'created') {
          logger.info(
            `GitHub issue #${commentPayload.issue.number} comment by ${commentPayload.comment.user.login}`
          );

          // Emit event for GitHubChannelHandler to process /approve and /reject commands
          events.emit('webhook:github:issue_comment', {
            issueNumber: commentPayload.issue.number,
            issueTitle: commentPayload.issue.title,
            commentId: commentPayload.comment.id,
            body: commentPayload.comment.body,
            author: commentPayload.comment.user.login,
            createdAt: commentPayload.comment.created_at,
            repository: commentPayload.repository.full_name,
          });
        }

        res.json({ success: true, message: 'Issue comment event processed' });
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

      // Only handle closed pull_request events
      if (payload.action !== 'closed') {
        logger.debug(`Ignoring PR action: ${payload.action}`);
        res.json({ success: true, message: 'Not a close event' });
        return;
      }

      // PR closed WITHOUT merging — find linked feature and recover to backlog
      if (!payload.pull_request.merged) {
        const closedPrNumber = payload.pull_request.number;
        const closedProjectPath =
          (await findProjectPathForFeature(featureLoader, settings.projects, (path) =>
            featureLoader.findByPRNumber(path, closedPrNumber).then(Boolean)
          )) ?? process.cwd();

        const closedFeature = await featureLoader.findByPRNumber(closedProjectPath, closedPrNumber);

        if (!closedFeature) {
          logger.debug(`No feature found for closed PR #${closedPrNumber}`);
          res.json({ success: true, message: 'No feature linked to this PR' });
          return;
        }

        if (closedFeature.status !== 'review') {
          logger.debug(
            `Feature ${closedFeature.id} is not in review (status=${closedFeature.status}), skipping recovery`
          );
          res.json({ success: true, message: 'Feature not in review, no recovery needed' });
          return;
        }

        logger.info(
          `PR #${closedPrNumber} closed without merging — recovering feature ${closedFeature.id} to backlog`
        );

        await featureLoader.update(closedProjectPath, closedFeature.id, {
          status: 'backlog',
          statusChangeReason: `PR #${closedPrNumber} closed without merging — auto-recovering to backlog`,
          prNumber: undefined,
          prUrl: undefined,
          reviewStartedAt: undefined,
        });

        events.emit('feature:pr-closed-unmerged', {
          featureId: closedFeature.id,
          projectPath: closedProjectPath,
          prNumber: closedPrNumber,
          prUrl: closedFeature.prUrl,
        });

        res.json({ success: true, message: `Feature ${closedFeature.id} recovered to backlog` });
        return;
      }

      const branchName = payload.pull_request.head.ref;
      const baseBranch = payload.pull_request.base.ref;
      const mergeCommitSha = payload.pull_request.merge_commit_sha ?? '';
      const prNumber = payload.pull_request.number;
      const prTitle = payload.pull_request.title;

      logger.info(`PR #${prNumber} merged: ${prTitle} (branch: ${branchName} → ${baseBranch})`);

      // Search all configured projects for the one containing this branch's feature
      const projectPath =
        (await findProjectPathForFeature(featureLoader, settings.projects, (path) =>
          findFeatureByBranch(featureLoader, path, branchName).then(Boolean)
        )) ?? process.cwd();

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

      // Idempotency guard: skip update if feature is already in a terminal status.
      // Prevents double-updating completedAt or re-emitting feature:pr-merged on duplicate
      // webhook deliveries.
      const TERMINAL_STATUSES = new Set(['done', 'completed', 'verified']);
      const wasAlreadyTerminal = TERMINAL_STATUSES.has(currentFeature.status ?? '');

      if (wasAlreadyTerminal) {
        logger.debug(
          `Feature "${feature.title}" already in terminal status '${currentFeature.status}' — skipping merge update for PR #${prNumber}`
        );
      } else {
        // Update feature status to done
        await featureLoader.update(projectPath, feature.featureId, {
          status: 'done',
        });

        logger.info(
          `Feature "${feature.title}" moved from "${currentFeature.status}" to "done" after PR #${prNumber} was merged`
        );

        // Epic completion is handled by CompletionDetectorService which reacts to
        // the feature:status-changed event emitted by featureLoader.update() above.
        // It creates an epic-to-dev PR instead of marking the epic done prematurely.

        // Emit event for UI notification
        events.emit('feature:pr-merged', {
          featureId: feature.featureId,
          title: feature.title,
          prNumber,
          prTitle,
          branchName,
          projectPath,
        });

        // Publish to TopicBus (hierarchical routing)
        if (topicBus) {
          topicBus.publish(`pr.merged.${prNumber}`, {
            featureId: feature.featureId,
            title: feature.title,
            prNumber,
            prTitle,
            branchName,
            baseBranch,
            projectPath,
          });
        }
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

      // Epic-to-dev merge detection: when an epic branch merges into dev,
      // mark the epic feature as done and clean up the branch. This completes
      // the epic lifecycle started by CompletionDetectorService.createEpicToDevPR().
      if (baseBranch === 'dev' && branchName.startsWith('epic/')) {
        try {
          const allFeatures = await featureLoader.getAll(projectPath);
          const epicFeature = allFeatures.find((f) => f.isEpic && f.branchName === branchName);
          if (epicFeature && epicFeature.status !== 'done') {
            const now = new Date().toISOString();
            await featureLoader.update(projectPath, epicFeature.id, {
              status: 'done',
              prMergedAt: now,
              completedAt: now,
              statusChangeReason: `Epic branch merged to dev (PR #${prNumber})`,
            });
            events.emit('feature:completed', {
              featureId: epicFeature.id,
              featureTitle: epicFeature.title,
              projectPath,
              isEpic: true,
            });
            logger.info(
              `Epic "${epicFeature.title}" marked done after epic-to-dev PR #${prNumber} merged`
            );

            // Clean up epic branch (fire-and-forget)
            exec(
              `git push origin --delete ${branchName}`,
              {
                cwd: projectPath,
                timeout: 15000,
              },
              (err) => {
                if (err) {
                  logger.debug(
                    `Epic branch cleanup skipped (may already be deleted): ${err.message}`
                  );
                }
              }
            );
          }
        } catch (epicErr) {
          logger.warn('Epic-to-dev merge detection failed (non-fatal):', epicErr);
        }
      }

      // Cascade rebase: update other open PRs targeting the same base branch
      // so they don't go CONFLICTING after this merge.
      const repoFullName = payload.repository.full_name;
      cascadeUpdateBranches(repoFullName, baseBranch, prNumber).catch((err) =>
        logger.warn(`Cascade branch update failed (non-fatal):`, err)
      );

      res.json({
        success: true,
        message: wasAlreadyTerminal
          ? `Feature already in terminal status '${currentFeature.status}'`
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
