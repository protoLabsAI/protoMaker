/**
 * Beads routes - HTTP API for Beads task management
 */

import { Router } from 'express';
import type { BeadsService } from '../../services/beads-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createCloseHandler } from './routes/close.js';
import { createReopenHandler } from './routes/reopen.js';
import { createReadyHandler } from './routes/ready.js';
import { createAddDependencyHandler } from './routes/add-dependency.js';

export function createBeadsRoutes(beadsService: BeadsService): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(beadsService));
  router.post('/get', validatePathParams('projectPath'), createGetHandler(beadsService));
  router.post('/create', validatePathParams('projectPath'), createCreateHandler(beadsService));
  router.post('/update', validatePathParams('projectPath'), createUpdateHandler(beadsService));
  router.post('/close', validatePathParams('projectPath'), createCloseHandler(beadsService));
  router.post('/reopen', validatePathParams('projectPath'), createReopenHandler(beadsService));
  router.post('/ready', validatePathParams('projectPath'), createReadyHandler(beadsService));
  router.post(
    '/add-dependency',
    validatePathParams('projectPath'),
    createAddDependencyHandler(beadsService)
  );

  return router;
}
