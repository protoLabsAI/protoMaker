/**
 * GitHub routes - HTTP API for GitHub integration
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createCheckGitHubRemoteHandler } from './routes/check-github-remote.js';
import { createListIssuesHandler } from './routes/list-issues.js';
import { createListPRsHandler } from './routes/list-prs.js';
import { createListCommentsHandler } from './routes/list-comments.js';
import { createValidateIssueHandler } from './routes/validate-issue.js';
import {
  createValidationStatusHandler,
  createValidationStopHandler,
  createGetValidationsHandler,
  createDeleteValidationHandler,
  createMarkViewedHandler,
} from './routes/validation-endpoints.js';
import { createProcessCodeRabbitFeedbackHandler } from './routes/process-coderabbit-feedback.js';
import { createGetPRFeedbackHandler } from './routes/get-pr-feedback.js';
import { createResolvePRThreadsHandler } from './routes/resolve-pr-threads.js';
import { createWebhookHandler } from './routes/webhook.js';
import { createMergePRHandler } from './routes/merge-pr.js';
import { createCheckPRStatusHandler } from './routes/check-pr-status.js';
import { createPRReviewCommentsHandler } from './routes/pr-review-comments.js';
import { createResolvePRCommentHandler } from './routes/resolve-pr-comment.js';
import { createWatchPRHandler } from './routes/watch-pr.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createGitHubRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  // Webhook endpoint - must be first (no validatePathParams middleware)
  // Uses query parameter for project path to support GitHub webhook configuration
  if (settingsService) {
    router.post('/webhook', createWebhookHandler(settingsService, events));
  }

  router.post('/check-remote', validatePathParams('projectPath'), createCheckGitHubRemoteHandler());
  router.post('/issues', validatePathParams('projectPath'), createListIssuesHandler());
  router.post('/prs', validatePathParams('projectPath'), createListPRsHandler());
  router.post('/issue-comments', validatePathParams('projectPath'), createListCommentsHandler());
  router.post(
    '/validate-issue',
    validatePathParams('projectPath'),
    createValidateIssueHandler(events, settingsService)
  );

  // Validation management endpoints
  router.post(
    '/validation-status',
    validatePathParams('projectPath'),
    createValidationStatusHandler()
  );
  router.post('/validation-stop', validatePathParams('projectPath'), createValidationStopHandler());
  router.post('/validations', validatePathParams('projectPath'), createGetValidationsHandler());
  router.post(
    '/validation-delete',
    validatePathParams('projectPath'),
    createDeleteValidationHandler()
  );
  router.post(
    '/validation-mark-viewed',
    validatePathParams('projectPath'),
    createMarkViewedHandler(events)
  );

  // CodeRabbit feedback processing
  router.post(
    '/process-coderabbit-feedback',
    validatePathParams('projectPath'),
    createProcessCodeRabbitFeedbackHandler(events)
  );
  router.post('/get-pr-feedback', validatePathParams('projectPath'), createGetPRFeedbackHandler());
  router.post(
    '/resolve-pr-threads',
    validatePathParams('projectPath'),
    createResolvePRThreadsHandler(events)
  );

  // PR merge operations
  router.post('/merge-pr', validatePathParams('projectPath'), createMergePRHandler());
  router.post(
    '/check-pr-status',
    validatePathParams('projectPath'),
    createCheckPRStatusHandler(settingsService)
  );

  // PR review comment operations
  router.post(
    '/pr-review-comments',
    validatePathParams('projectPath'),
    createPRReviewCommentsHandler()
  );
  router.post(
    '/resolve-pr-comment',
    validatePathParams('projectPath'),
    createResolvePRCommentHandler()
  );

  return router;
}
