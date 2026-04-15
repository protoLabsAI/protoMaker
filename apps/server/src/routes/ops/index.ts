/**
 * Ops routes - Operational management endpoints
 *
 * /api/ops/timers            - Timer registry (cron + interval listing, pause/resume)
 * /api/ops/deliveries        - Webhook delivery tracking (list, detail, retry)
 * /api/ops/audit             - Tool execution audit log (recent entries with filtering)
 * /api/ops/concurrency       - Concurrency resolution overview (precedence chain + active loops)
 * /api/ops/events            - Correlated event store (query, chain reconstruction)
 * /api/ops/worktree-cleanup  - Manual trigger for done-worktree cleanup sweep
 */

import { Router } from 'express';

import type { SchedulerService } from '../../services/scheduler-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { EventRouterService } from '../../services/event-router-service.js';
import type { AuditService } from '../../services/audit-service.js';
import type { AutoModeService } from '../../services/auto-mode-service.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { EventStore } from '../../lib/event-store.js';
import type { WorktreeLifecycleService } from '../../services/worktree-lifecycle-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import { createTimersRoutes } from './routes/timers.js';
import { createDeliveriesRoutes } from './routes/deliveries.js';
import { createAuditRoutes } from './routes/audit.js';
import { createConcurrencyRoutes } from './routes/concurrency.js';
import { createEventsRoutes } from './routes/events.js';
import { createWorktreeCleanupRoutes } from './routes/worktree-cleanup.js';

export function createOpsRoutes(
  schedulerService: SchedulerService,
  events: EventEmitter,
  eventRouterService: EventRouterService,
  auditService: AuditService,
  autoModeService: AutoModeService,
  settingsService: SettingsService,
  eventStore: EventStore,
  worktreeLifecycleService: WorktreeLifecycleService,
  featureLoader: FeatureLoader
): Router {
  const router = Router();

  router.use('/timers', createTimersRoutes(schedulerService, events));
  router.use('/deliveries', createDeliveriesRoutes(eventRouterService));
  router.use('/audit', createAuditRoutes(auditService));
  router.use('/concurrency', createConcurrencyRoutes(autoModeService, settingsService));
  router.use('/events', createEventsRoutes(eventStore));
  router.use(
    '/worktree-cleanup',
    createWorktreeCleanupRoutes(worktreeLifecycleService, featureLoader, events, autoModeService)
  );

  return router;
}
