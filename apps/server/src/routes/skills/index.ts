/**
 * Skills routes - HTTP API for skill management
 *
 * Provides endpoints for managing self-learning skills including
 * CRUD operations and usage tracking.
 */

import { Router } from 'express';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createDeleteHandler } from './routes/delete.js';
import { createRecordUsageHandler } from './routes/record-usage.js';

/**
 * Create the skills router
 *
 * @returns Express router with skills endpoints
 */
export function createSkillsRoutes(): Router {
  const router = Router();

  router.post('/list', createListHandler());
  router.post('/get', createGetHandler());
  router.post('/create', createCreateHandler());
  router.post('/update', createUpdateHandler());
  router.post('/delete', createDeleteHandler());
  router.post('/record-usage', createRecordUsageHandler());

  return router;
}
