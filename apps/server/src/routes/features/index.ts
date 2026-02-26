/**
 * Features routes - HTTP API for feature management
 */

import { Router } from 'express';
import { FeatureLoader } from '../../services/feature-loader.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { AuthorityService } from '../../services/authority-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createBulkUpdateHandler } from './routes/bulk-update.js';
import { createBulkDeleteHandler } from './routes/bulk-delete.js';
import { createDeleteHandler } from './routes/delete.js';
import { createAgentOutputHandler, createRawOutputHandler } from './routes/agent-output.js';
import { createGenerateTitleHandler } from './routes/generate-title.js';
import { createHealthHandler } from './routes/health.js';
import { createAssignAgentHandler } from './routes/assign-agent.js';
import { createSummaryHandler } from './routes/summary.js';
import type { FeatureHealthService } from '../../services/feature-health-service.js';
import type { RoleRegistryService } from '../../services/role-registry-service.js';
import type { TrustTierService } from '../../services/trust-tier-service.js';

export function createFeaturesRoutes(
  featureLoader: FeatureLoader,
  trustTierService: TrustTierService,
  settingsService?: SettingsService,
  events?: EventEmitter,
  authorityService?: AuthorityService,
  healthService?: FeatureHealthService,
  roleRegistry?: RoleRegistryService
): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(featureLoader));
  router.post('/get', validatePathParams('projectPath'), createGetHandler(featureLoader));
  router.post(
    '/create',
    validatePathParams('projectPath'),
    createCreateHandler(featureLoader, trustTierService, events)
  );
  router.post(
    '/update',
    validatePathParams('projectPath'),
    createUpdateHandler(featureLoader, settingsService, authorityService, healthService, events)
  );
  router.post(
    '/bulk-update',
    validatePathParams('projectPath'),
    createBulkUpdateHandler(featureLoader)
  );
  router.post(
    '/bulk-delete',
    validatePathParams('projectPath'),
    createBulkDeleteHandler(featureLoader, events)
  );
  router.post(
    '/delete',
    validatePathParams('projectPath'),
    createDeleteHandler(featureLoader, events)
  );
  router.post('/summary', validatePathParams('projectPath'), createSummaryHandler(featureLoader));
  router.post('/agent-output', createAgentOutputHandler(featureLoader));
  router.post('/raw-output', createRawOutputHandler(featureLoader));
  router.post('/generate-title', createGenerateTitleHandler(settingsService));
  router.post(
    '/assign-agent',
    validatePathParams('projectPath'),
    createAssignAgentHandler(featureLoader, roleRegistry, events)
  );

  if (healthService) {
    router.post('/health', validatePathParams('projectPath'), createHealthHandler(healthService));
  }

  return router;
}
