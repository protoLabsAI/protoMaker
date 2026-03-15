/**
 * Ops routes - Operational management endpoints
 *
 * /api/ops/timers - Timer registry (cron + interval listing, pause/resume)
 */

import { Router } from 'express';

import type { SchedulerService } from '../../services/scheduler-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { createTimersRoutes } from './routes/timers.js';

export function createOpsRoutes(schedulerService: SchedulerService, events: EventEmitter): Router {
  const router = Router();

  router.use('/timers', createTimersRoutes(schedulerService, events));

  return router;
}
