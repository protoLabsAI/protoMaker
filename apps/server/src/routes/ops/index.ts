/**
 * Ops routes - Operational management endpoints
 *
 * /api/ops/timers     - Timer registry (cron + interval listing, pause/resume)
 * /api/ops/deliveries - Webhook delivery tracking (list, detail, retry)
 * /api/ops/audit      - Tool execution audit log (recent entries with filtering)
 */

import { Router } from 'express';

import type { SchedulerService } from '../../services/scheduler-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { EventRouterService } from '../../services/event-router-service.js';
import type { AuditService } from '../../services/audit-service.js';
import { createTimersRoutes } from './routes/timers.js';
import { createDeliveriesRoutes } from './routes/deliveries.js';
import { createAuditRoutes } from './routes/audit.js';

export function createOpsRoutes(
  schedulerService: SchedulerService,
  events: EventEmitter,
  eventRouterService: EventRouterService,
  auditService: AuditService
): Router {
  const router = Router();

  router.use('/timers', createTimersRoutes(schedulerService, events));
  router.use('/deliveries', createDeliveriesRoutes(eventRouterService));
  router.use('/audit', createAuditRoutes(auditService));

  return router;
}
