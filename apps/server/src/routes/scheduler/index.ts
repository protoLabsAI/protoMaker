/**
 * Scheduler routes - HTTP API for scheduler service
 */

import { Router } from 'express';
import type { SchedulerService } from '../../services/scheduler-service.js';
import { createGetStatusHandler } from './routes/get-status.js';
import { createEnableTaskHandler } from './routes/enable-task.js';
import { createDisableTaskHandler } from './routes/disable-task.js';
import { createUpdateScheduleHandler } from './routes/update-schedule.js';
import { createTriggerTaskHandler } from './routes/trigger-task.js';

export function createSchedulerRoutes(schedulerService: SchedulerService): Router {
  const router = Router();

  router.get('/status', createGetStatusHandler(schedulerService));
  router.post('/tasks/:taskId/enable', createEnableTaskHandler(schedulerService));
  router.post('/tasks/:taskId/disable', createDisableTaskHandler(schedulerService));
  router.post('/tasks/:taskId/schedule', createUpdateScheduleHandler(schedulerService));
  router.post('/tasks/:taskId/trigger', createTriggerTaskHandler(schedulerService));

  return router;
}
