/**
 * Ops routes - Operational management endpoints
 *
 * /api/ops/timers       - Timer registry (cron + interval listing, pause/resume)
 * /api/ops/deliveries   - Webhook delivery tracking (list, detail, retry)
 * /api/ops/audit        - Tool execution audit log (recent entries with filtering)
 * /api/ops/concurrency  - Concurrency resolution overview (precedence chain + active loops)
 */

import { Router } from 'express';

import type { SchedulerService } from '../../services/scheduler-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { EventRouterService } from '../../services/event-router-service.js';
import type { AuditService } from '../../services/audit-service.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { SettingsService } from '../../services/settings-service.js';
import { createTimersRoutes } from './routes/timers.js';
import { createDeliveriesRoutes } from './routes/deliveries.js';
import { createAuditRoutes } from './routes/audit.js';
import { createConcurrencyRoutes } from './routes/concurrency.js';

export function createOpsRoutes(
  schedulerService: SchedulerService,
  events: EventEmitter,
  eventRouterService: EventRouterService,
  auditService: AuditService,
  autoModeService: AutoModeService,
  settingsService: SettingsService
): Router {
  const router = Router();

  router.use('/timers', createTimersRoutes(schedulerService, events));
  router.use('/deliveries', createDeliveriesRoutes(eventRouterService));
  router.use('/audit', createAuditRoutes(auditService));
  router.use('/concurrency', createConcurrencyRoutes(autoModeService, settingsService));

  return router;
}
