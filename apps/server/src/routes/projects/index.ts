/**
 * Projects routes - HTTP API for project orchestration
 *
 * Provides endpoints for managing project plans:
 * - List all project plans
 * - Get a project with milestones and phases
 * - Create a new project plan
 * - Update a project plan
 * - Delete a project plan
 * - Create features from a project plan
 */

import { Router } from 'express';
import { FeatureLoader } from '../../services/feature-loader.js';
import type { EventEmitter } from '../../lib/events.js';
import type { ProjectService } from '../../services/project-service.js';
import { validatePathParams, validateSlugs } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createDeleteHandler } from './routes/delete.js';
import { createCreateFeaturesHandler } from './routes/create-features.js';
import { createArchiveHandler } from './routes/archive.js';
import { createLifecycleRoutes } from './lifecycle/index.js';
import type { ProjectLifecycleService } from '../../services/project-lifecycle-service.js';
import { createProjectTools, toExpressRouter } from '@protolabs-ai/tools';

export function createProjectsRoutes(
  featureLoader: FeatureLoader,
  events: EventEmitter,
  projectService: ProjectService,
  lifecycleService?: ProjectLifecycleService
): Router {
  const router = Router();

  // List doesn't need slug validation (no slug param)
  router.post('/list', validatePathParams('projectPath'), createListHandler());

  // All other routes use projectSlug - validate to prevent path traversal
  router.post(
    '/get',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createGetHandler()
  );
  router.post(
    '/create',
    validatePathParams('projectPath'),
    validateSlugs('slug?'), // slug is optional, derived from title if not provided
    createCreateHandler()
  );
  router.post(
    '/update',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createUpdateHandler()
  );
  router.post(
    '/delete',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createDeleteHandler()
  );
  router.post(
    '/create-features',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createCreateFeaturesHandler(featureLoader, events)
  );
  router.post(
    '/archive',
    validatePathParams('projectPath'),
    validateSlugs('projectSlug'),
    createArchiveHandler(projectService)
  );

  // Mount lifecycle routes if service is available
  if (lifecycleService) {
    router.use('/lifecycle', createLifecycleRoutes(lifecycleService, projectService, events));
  }

  // Mount shared project tools via Express adapter (links, updates, docs, features)
  const projectTools = createProjectTools({ projectService });
  const toolRouter = toExpressRouter(projectTools, { basePath: '/tools' });
  router.use(toolRouter);

  return router;
}
