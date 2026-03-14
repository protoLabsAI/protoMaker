/**
 * Features routes - HTTP API for feature management
 */

import { Router } from 'express';
import { FeatureLoader } from '../../services/feature-loader.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { AuthorityService } from '../../services/authority-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { validateBody } from '../../middleware/validate-body.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler, CreateRequestSchema } from './routes/create.js';
import { createUpdateHandler, UpdateRequestSchema } from './routes/update.js';
import { createBulkUpdateHandler, BulkUpdateRequestSchema } from './routes/bulk-update.js';
import { createBulkDeleteHandler, BulkDeleteRequestSchema } from './routes/bulk-delete.js';
import { createDeleteHandler, DeleteRequestSchema } from './routes/delete.js';
import { createAgentOutputHandler, createRawOutputHandler } from './routes/agent-output.js';
import { createGenerateTitleHandler } from './routes/generate-title.js';
import { createHealthHandler } from './routes/health.js';
import { createAssignAgentHandler } from './routes/assign-agent.js';
import { createSummaryHandler } from './routes/summary.js';
import { createRollbackHandler, RollbackRequestSchema } from './routes/rollback.js';
import type { FeatureHealthService } from '../../services/feature-health-service.js';
import type { TrustTierService } from '../../services/trust-tier-service.js';

export function createFeaturesRoutes(
  featureLoader: FeatureLoader,
  trustTierService: TrustTierService,
  settingsService?: SettingsService,
  events?: EventEmitter,
  authorityService?: AuthorityService,
  healthService?: FeatureHealthService
): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(featureLoader));
  router.post('/get', validatePathParams('projectPath'), createGetHandler(featureLoader));
  router.post(
    '/create',
    validatePathParams('projectPath'),
    validateBody(CreateRequestSchema),
    createCreateHandler(featureLoader, trustTierService, events)
  );
  router.post(
    '/update',
    validatePathParams('projectPath'),
    validateBody(UpdateRequestSchema),
    createUpdateHandler(featureLoader, settingsService, authorityService, healthService, events)
  );
  router.post(
    '/bulk-update',
    validatePathParams('projectPath'),
    validateBody(BulkUpdateRequestSchema),
    createBulkUpdateHandler(featureLoader)
  );
  router.post(
    '/bulk-delete',
    validatePathParams('projectPath'),
    validateBody(BulkDeleteRequestSchema),
    createBulkDeleteHandler(featureLoader, events)
  );
  router.post(
    '/delete',
    validatePathParams('projectPath'),
    validateBody(DeleteRequestSchema),
    createDeleteHandler(featureLoader, events)
  );
  router.post(
    '/summary',
    validatePathParams('projectPath'),
    createSummaryHandler(featureLoader, settingsService)
  );
  router.post('/agent-output', createAgentOutputHandler(featureLoader));
  router.post('/raw-output', createRawOutputHandler(featureLoader));
  router.post('/generate-title', createGenerateTitleHandler(settingsService));
  router.post(
    '/assign-agent',
    validatePathParams('projectPath'),
    createAssignAgentHandler(featureLoader, events)
  );

  if (healthService) {
    router.post('/health', validatePathParams('projectPath'), createHealthHandler(healthService));
  }

  router.post(
    '/rollback',
    validatePathParams('projectPath'),
    validateBody(RollbackRequestSchema),
    createRollbackHandler(featureLoader)
  );

  return router;
}
