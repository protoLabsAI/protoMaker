/**
 * GitHub Webhook Handler - Receives and processes inbound webhook events
 *
 * Handles GitHub webhook events (issues, PRs, pushes) with HMAC-SHA256 signature verification.
 * Supports automatic feature creation from GitHub issues when configured.
 */

import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@protolabsai/utils';
import type {
  GitHubWebhookPayload,
  GitHubIssueWebhookPayload,
  GitHubPullRequestWebhookPayload,
  GitHubPullRequestReviewWebhookPayload,
  GitHubPushWebhookPayload,
  GitHubPingWebhookPayload,
  GitHubCheckSuiteWebhookPayload,
  GitHubCheckRunWebhookPayload,
} from '@protolabsai/types';
import type { SettingsService } from '../../../services/settings-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import { generateCorrelationId } from '../../../lib/events.js';
import { getPRWatcherService } from '../../../services/pr-watcher-service.js';
import { projectPathSchema } from '../../../lib/validation.js';
import { verifySingleSecret } from '../../../lib/webhook-signature.js';

const logger = createLogger('GitHubWebhook');

const webhookQuerySchema = z.object({
  project: projectPathSchema,
});

/**
 * Validates the basic structure of a GitHub webhook payload.
 * Uses passthrough() to preserve all fields for downstream event-specific handlers.
 * The repository field is present on all non-ping event types.
 */
const webhookPayloadSchema = z
  .object({
    repository: z
      .object({
        full_name: z.string(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// Webhook signature verification is handled by the shared utility
// in lib/webhook-signature.ts (verifySingleSecret for per-project secrets)

/**
 * Handle GitHub ping event (webhook test)
 */
async function handlePingEvent(payload: GitHubPingWebhookPayload): Promise<void> {
  logger.info(
    `Received ping event for repository ${payload.repository.full_name} (hook_id: ${payload.hook_id})`
  );
  logger.debug(`Zen message: ${payload.zen}`);
}

/**
 * Handle GitHub issue event
 */
async function handleIssueEvent(
  payload: GitHubIssueWebhookPayload,
  projectPath: string,
  events: EventEmitter
): Promise<void> {
  const { action, issue, repository } = payload;

  logger.info(
    `Received issue event: ${action} on ${repository.full_name}#${issue.number} - ${issue.title}`
  );

  // Emit event for logging and potential auto-creation
  events.emit('webhook:github:issue', {
    action,
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueBody: issue.body,
    issueUrl: issue.html_url,
    repository: repository.full_name,
    projectPath,
    labels: issue.labels?.map((l) => l.name) || [],
  });

  // Future: Auto-create features from issues when webhookSettings.autoCreateFromIssues is enabled
  // This would integrate with the feature creation logic
}

/**
 * Handle GitHub pull request event
 */
async function handlePullRequestEvent(
  payload: GitHubPullRequestWebhookPayload,
  projectPath: string,
  events: EventEmitter
): Promise<void> {
  const { action, pull_request, repository } = payload;

  logger.info(
    `Received PR event: ${action} on ${repository.full_name}#${pull_request.number} - ${pull_request.title}`
  );

  // Emit event for logging
  events.emit('webhook:github:pull_request', {
    action,
    prNumber: pull_request.number,
    prTitle: pull_request.title,
    prUrl: pull_request.html_url,
    repository: repository.full_name,
    projectPath,
    merged: pull_request.merged,
    headBranch: pull_request.head.ref,
    baseBranch: pull_request.base.ref,
  });

  // PR merge -> feature status transition is handled by the primary webhook router
  // at apps/server/src/routes/webhooks/routes/github.ts (pull_request.closed + merged:true).
  // Do not implement it here.
}

/**
 * Handle GitHub push event
 */
async function handlePushEvent(
  payload: GitHubPushWebhookPayload,
  projectPath: string,
  events: EventEmitter
): Promise<void> {
  const { ref, repository, commits } = payload;

  logger.info(`Received push event on ${repository.full_name} (${ref}): ${commits.length} commits`);

  // Emit event for logging
  events.emit('webhook:github:push', {
    ref,
    repository: repository.full_name,
    projectPath,
    commitCount: commits.length,
    commits: commits.map((c) => ({
      sha: c.id,
      message: c.message,
    })),
  });

  // Future: Trigger builds or update feature status based on commits
}

/**
 * Handle GitHub pull request review event
 */
async function handlePullRequestReviewEvent(
  payload: GitHubPullRequestReviewWebhookPayload,
  projectPath: string,
  events: EventEmitter
): Promise<void> {
  const { action, review, pull_request, repository } = payload;

  logger.info(
    `Received PR review event: ${action} on ${repository.full_name}#${pull_request.number} - ${review.state}`
  );

  // Only emit for submitted reviews
  if (action === 'submitted') {
    events.emit('pr:review-submitted', {
      prNumber: pull_request.number,
      prTitle: pull_request.title,
      prUrl: pull_request.html_url,
      repository: repository.full_name,
      projectPath,
      reviewId: review.id,
      reviewState: review.state,
      reviewBody: review.body,
      reviewUrl: review.html_url,
      reviewer: review.user.login,
      submittedAt: review.submitted_at,
      headBranch: pull_request.head.ref,
      baseBranch: pull_request.base.ref,
    });

    logger.debug(
      `Emitted pr:review-submitted event for PR #${pull_request.number} (state: ${review.state})`
    );
  }
}

/**
 * Handle GitHub check suite completed event (CI failures)
 */
async function handleCheckSuiteEvent(
  payload: GitHubCheckSuiteWebhookPayload,
  projectPath: string,
  events: EventEmitter
): Promise<void> {
  const { action, check_suite, repository } = payload;

  logger.info(
    `Received check_suite event: ${action} on ${repository.full_name} (conclusion: ${check_suite.conclusion})`
  );

  // Only process completed check suites with failure conclusion
  if (action !== 'completed' || check_suite.conclusion !== 'failure') {
    return;
  }

  // Only process if there are associated PRs
  if (!check_suite.pull_requests || check_suite.pull_requests.length === 0) {
    logger.debug(`Check suite ${check_suite.id} has no associated PRs, ignoring`);
    return;
  }

  // Emit CI failure event for each associated PR
  for (const pr of check_suite.pull_requests) {
    logger.info(
      `CI failure detected for PR #${pr.number} (check_suite: ${check_suite.id}, sha: ${check_suite.head_sha})`
    );

    events.emit('pr:ci-failure', {
      projectPath,
      prNumber: pr.number,
      headBranch: pr.head.ref,
      headSha: check_suite.head_sha,
      checkSuiteId: check_suite.id,
      checkSuiteUrl: check_suite.url,
      repository: repository.full_name,
      checksUrl: check_suite.check_runs_url,
    });
  }
}

/**
 * Handle GitHub check run completed event — fast-path trigger for PRWatcherService
 */
async function handleCheckRunEvent(
  payload: GitHubCheckRunWebhookPayload,
  projectPath: string
): Promise<void> {
  const { action, check_run } = payload;

  // Only react to completed check runs
  if (action !== 'completed') return;

  const prs = check_run.pull_requests ?? [];
  if (prs.length === 0) return;

  const watcher = getPRWatcherService();
  if (!watcher) return;

  for (const pr of prs) {
    if (watcher.isWatching(pr.number)) {
      logger.info(
        `check_run completed for PR #${pr.number} (${check_run.name}) — triggering watcher check`
      );
      await watcher.triggerCheck(pr.number);
    }
  }

  logger.debug(
    `Processed check_run ${check_run.id} (${check_run.name}) for project: ${projectPath}`
  );
}

/**
 * Create webhook handler
 *
 * Receives GitHub webhook events, verifies signatures, and processes the payload.
 * Requires raw body for signature verification.
 */
export function createWebhookHandler(
  settingsService: SettingsService,
  events: EventEmitter
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate query parameter
      const queryParsed = webhookQuerySchema.safeParse(req.query);
      if (!queryParsed.success) {
        res.status(400).json({
          error: 'Missing project query parameter',
          message: 'Webhook URL must include ?project=/path/to/project',
          details: queryParsed.error.issues,
        });
        return;
      }
      const { project: projectPath } = queryParsed.data;

      // Load project settings to get webhook secret
      const projectSettings = await settingsService.getProjectSettings(projectPath);
      const webhookSettings = projectSettings.webhookSettings;

      // Check if webhooks are enabled
      if (!webhookSettings?.webhookEnabled) {
        res.status(403).json({
          error: 'Webhooks disabled',
          message: 'Webhooks are not enabled for this project',
        });
        return;
      }

      // Verify webhook secret is configured
      if (!webhookSettings.webhookSecret) {
        logger.error('Webhook secret not configured for project:', projectPath);
        res.status(500).json({
          error: 'Configuration error',
          message: 'Webhook secret not configured',
        });
        return;
      }

      // Get raw body for signature verification
      // Express should preserve rawBody when using express.json({ verify: ... })
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

      if (!rawBody) {
        logger.error('Raw body not available for signature verification');
        res.status(500).json({
          error: 'Server error',
          message: 'Unable to verify webhook signature (raw body missing)',
        });
        return;
      }

      // Verify signature using shared utility
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const verification = verifySingleSecret(rawBody, signature, webhookSettings.webhookSecret);

      if (!verification.valid) {
        logger.warn(`Webhook signature verification failed: ${verification.error}`);
        res.status(401).json({
          error: 'Unauthorized',
          message: verification.error,
        });
        return;
      }

      // Get event type from header
      const eventType = req.headers['x-github-event'] as string | undefined;

      if (!eventType) {
        res.status(400).json({
          error: 'Missing X-GitHub-Event header',
        });
        return;
      }

      logger.info(`Processing GitHub ${eventType} event for project: ${projectPath}`);

      // Set correlation context for the entire webhook processing chain.
      // All events emitted during this handler share a single correlationId.
      const webhookCorrelationId = generateCorrelationId();
      events.setCorrelationContext({
        correlationId: webhookCorrelationId,
        source: 'github-webhook',
      });

      // Validate basic payload structure
      const payloadParsed = webhookPayloadSchema.safeParse(req.body);
      if (!payloadParsed.success) {
        res.status(400).json({
          error: 'Invalid webhook payload',
          details: payloadParsed.error.issues,
        });
        return;
      }

      // Process event based on type (narrowing to specific payload types is safe
      // after structural validation -- GitHub is the trusted sender)
      const payload = payloadParsed.data as unknown as GitHubWebhookPayload;

      switch (eventType) {
        case 'ping':
          await handlePingEvent(payload as GitHubPingWebhookPayload);
          break;

        case 'issues':
          await handleIssueEvent(payload as GitHubIssueWebhookPayload, projectPath, events);
          break;

        case 'pull_request':
          await handlePullRequestEvent(
            payload as GitHubPullRequestWebhookPayload,
            projectPath,
            events
          );
          break;

        case 'pull_request_review':
          await handlePullRequestReviewEvent(
            payload as GitHubPullRequestReviewWebhookPayload,
            projectPath,
            events
          );
          break;

        case 'check_suite':
          await handleCheckSuiteEvent(
            payload as GitHubCheckSuiteWebhookPayload,
            projectPath,
            events
          );
          break;

        case 'check_run':
          await handleCheckRunEvent(payload as GitHubCheckRunWebhookPayload, projectPath);
          break;

        case 'push':
          await handlePushEvent(payload as GitHubPushWebhookPayload, projectPath, events);
          break;

        default:
          logger.info(`Ignoring unsupported event type: ${eventType}`);
          res.status(200).json({
            message: `Event type ${eventType} not supported`,
          });
          return;
      }

      // Clear correlation context after processing
      events.clearCorrelationContext();

      // Success response
      res.status(200).json({
        message: 'Webhook processed successfully',
        event: eventType,
        correlationId: webhookCorrelationId,
      });
    } catch (error) {
      events.clearCorrelationContext();
      logger.error('Error processing webhook:', error);
      next(error);
    }
  };
}
