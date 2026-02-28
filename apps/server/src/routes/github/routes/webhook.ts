/**
 * GitHub Webhook Handler - Receives and processes inbound webhook events
 *
 * Handles GitHub webhook events (issues, PRs, pushes) with HMAC-SHA256 signature verification.
 * Supports automatic feature creation from GitHub issues when configured.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type {
  GitHubWebhookPayload,
  GitHubIssueWebhookPayload,
  GitHubPullRequestWebhookPayload,
  GitHubPullRequestReviewWebhookPayload,
  GitHubPushWebhookPayload,
  GitHubPingWebhookPayload,
  WebhookVerificationResult,
  GitHubCheckSuiteWebhookPayload,
} from '@protolabs-ai/types';
import type { SettingsService } from '../../../services/settings-service.js';
import type { EventEmitter } from '../../../lib/events.js';

const logger = createLogger('GitHubWebhook');

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 *
 * @param payload - Raw request body (string or Buffer)
 * @param signature - GitHub signature from X-Hub-Signature-256 header
 * @param secret - Webhook secret configured in GitHub and project settings
 * @returns Verification result with valid flag and optional error
 */
function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string | undefined,
  secret: string
): WebhookVerificationResult {
  if (!signature) {
    return {
      valid: false,
      error: 'Missing X-Hub-Signature-256 header',
    };
  }

  if (!signature.startsWith('sha256=')) {
    return {
      valid: false,
      error: 'Invalid signature format (expected sha256=...)',
    };
  }

  // Compute expected signature
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  // Timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return {
        valid: false,
        error: 'Invalid signature',
      };
    }

    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

    return {
      valid: isValid,
      error: isValid ? undefined : 'Invalid signature',
    };
  } catch (error) {
    logger.error('Error verifying webhook signature:', error);
    return {
      valid: false,
      error: 'Signature verification failed',
    };
  }
}

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
      // Extract project path from query parameter
      const projectPath = req.query.project as string | undefined;

      if (!projectPath) {
        res.status(400).json({
          error: 'Missing project query parameter',
          message: 'Webhook URL must include ?project=/path/to/project',
        });
        return;
      }

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

      // Verify signature
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const verification = verifyWebhookSignature(
        rawBody,
        signature,
        webhookSettings.webhookSecret
      );

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

      // Process event based on type
      const payload = req.body as GitHubWebhookPayload;

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

      // Success response
      res.status(200).json({
        message: 'Webhook processed successfully',
        event: eventType,
      });
    } catch (error) {
      logger.error('Error processing webhook:', error);
      next(error);
    }
  };
}
