/**
 * Automation routes - REST API for the Automation Registry
 *
 * GET  /list           - List all automations
 * GET  /:id            - Get a single automation
 * POST /create         - Create a new automation
 * PUT  /:id            - Update an automation (enable/disable, schedule, etc.)
 * DELETE /:id          - Delete an automation
 * GET  /:id/history    - Get run history for an automation
 * POST /:id/run        - Manually trigger an automation
 */

import { Router } from 'express';
import type { AutomationService } from '../../services/automation-service.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createDeleteHandler } from './routes/delete.js';
import { createHistoryHandler } from './routes/history.js';
import { createRunHandler } from './routes/run.js';
import { createSchedulerStatusHandler } from './routes/scheduler-status.js';

export function createAutomationsRoutes(automationService: AutomationService): Router {
  const router = Router();

  router.get('/list', createListHandler(automationService));
  router.get('/scheduler/status', createSchedulerStatusHandler(automationService));
  router.post('/create', createCreateHandler(automationService));
  router.get('/:id/history', createHistoryHandler(automationService));
  router.post('/:id/run', createRunHandler(automationService));
  router.get('/:id', createGetHandler(automationService));
  router.put('/:id', createUpdateHandler(automationService));
  router.delete('/:id', createDeleteHandler(automationService));

  return router;
}
