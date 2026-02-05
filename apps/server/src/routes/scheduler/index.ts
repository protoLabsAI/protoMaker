/**
 * Scheduler routes - HTTP API for scheduler service
 */

import { Router } from 'express';
import type { SchedulerService } from '../../services/scheduler-service.js';
import { createGetStatusHandler } from './routes/get-status.js';

export function createSchedulerRoutes(schedulerService: SchedulerService): Router {
  const router = Router();

  router.get('/status', createGetStatusHandler(schedulerService));

  return router;
}
