/**
 * Auto Mode routes - HTTP API for autonomous feature implementation
 *
 * Uses the AutoModeService for real feature execution with Claude Agent SDK
 */

import { Router } from 'express';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createStopFeatureHandler } from './routes/stop-feature.js';
import { createStatusHandler } from './routes/status.js';
import { createRunFeatureHandler } from './routes/run-feature.js';
import { createStartHandler } from './routes/start.js';
import { createStopHandler } from './routes/stop.js';
import { createVerifyFeatureHandler } from './routes/verify-feature.js';
import { createResumeFeatureHandler } from './routes/resume-feature.js';
import { createResumeWithFeedbackHandler } from './routes/resume-with-feedback.js';
import { createContextExistsHandler } from './routes/context-exists.js';
import { createAnalyzeProjectHandler } from './routes/analyze-project.js';
import { createFollowUpFeatureHandler } from './routes/follow-up-feature.js';
import { createCommitFeatureHandler } from './routes/commit-feature.js';
import { createApprovePlanHandler } from './routes/approve-plan.js';
import { createResumeInterruptedHandler } from './routes/resume-interrupted.js';
import { createReconcileHandler } from './routes/reconcile.js';

export function createAutoModeRoutes(
  autoModeService: AutoModeService,
  featureLoader: FeatureLoader,
  settingsService: SettingsService,
  events?: EventEmitter
): Router {
  const router = Router();

  // Auto loop control routes
  router.post('/start', validatePathParams('projectPath'), createStartHandler(autoModeService));
  router.post('/stop', validatePathParams('projectPath'), createStopHandler(autoModeService));

  router.post('/stop-feature', createStopFeatureHandler(autoModeService));
  router.post('/status', validatePathParams('projectPath?'), createStatusHandler(autoModeService));
  router.post(
    '/run-feature',
    validatePathParams('projectPath'),
    createRunFeatureHandler(autoModeService, featureLoader)
  );
  router.post(
    '/verify-feature',
    validatePathParams('projectPath'),
    createVerifyFeatureHandler(autoModeService)
  );
  router.post(
    '/resume-feature',
    validatePathParams('projectPath'),
    createResumeFeatureHandler(autoModeService)
  );
  router.post(
    '/resume-with-feedback',
    validatePathParams('projectPath'),
    createResumeWithFeedbackHandler(autoModeService)
  );
  router.post(
    '/context-exists',
    validatePathParams('projectPath'),
    createContextExistsHandler(autoModeService)
  );
  router.post(
    '/analyze-project',
    validatePathParams('projectPath'),
    createAnalyzeProjectHandler(autoModeService)
  );
  router.post(
    '/follow-up-feature',
    validatePathParams('projectPath', 'imagePaths[]'),
    createFollowUpFeatureHandler(autoModeService)
  );
  router.post(
    '/commit-feature',
    validatePathParams('projectPath', 'worktreePath?'),
    createCommitFeatureHandler(autoModeService)
  );
  router.post(
    '/approve-plan',
    validatePathParams('projectPath'),
    createApprovePlanHandler(autoModeService)
  );
  router.post(
    '/resume-interrupted',
    validatePathParams('projectPath'),
    createResumeInterruptedHandler(autoModeService, featureLoader, settingsService, events)
  );
  router.post(
    '/reconcile',
    validatePathParams('projectPath?'),
    createReconcileHandler(autoModeService, settingsService)
  );

  return router;
}
