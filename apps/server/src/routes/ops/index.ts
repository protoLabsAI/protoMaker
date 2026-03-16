/**
 * Ops routes - Operational management endpoints
 *
 * /api/ops/timers     - Timer registry (cron + interval listing, pause/resume)
 * /api/ops/deliveries - Webhook delivery tracking (list, detail, retry)
 */

import { Router } from 'express';

import type { SchedulerService } from '../../services/scheduler-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { EventRouterService } from '../../services/event-router-service.js';
import { createTimersRoutes } from './routes/timers.js';
import { createDeliveriesRoutes } from './routes/deliveries.js';

export function createOpsRoutes(
  schedulerService: SchedulerService,
  events: EventEmitter,
  eventRouterService: EventRouterService
): Router {
  const router = Router();

  router.use('/timers', createTimersRoutes(schedulerService, events));
  router.use('/deliveries', createDeliveriesRoutes(eventRouterService));

  return router;
}
