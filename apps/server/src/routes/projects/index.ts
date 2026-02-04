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
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createDeleteHandler } from './routes/delete.js';
import { createCreateFeaturesHandler } from './routes/create-features.js';

export function createProjectsRoutes(featureLoader: FeatureLoader): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler());
  router.post('/get', validatePathParams('projectPath'), createGetHandler());
  router.post('/create', validatePathParams('projectPath'), createCreateHandler());
  router.post('/update', validatePathParams('projectPath'), createUpdateHandler());
  router.post('/delete', validatePathParams('projectPath'), createDeleteHandler());
  router.post(
    '/create-features',
    validatePathParams('projectPath'),
    createCreateFeaturesHandler(featureLoader)
  );

  return router;
}
