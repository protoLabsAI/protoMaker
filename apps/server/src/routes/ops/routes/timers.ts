/**
 * Timer Registry API routes
 *
 * Provides a unified view of all cron tasks and interval timers managed by the
 * SchedulerService, along with pause/resume controls for individual and bulk operations.
 *
 * GET  /              - List all timers (cron + interval)
 * POST /:id/pause     - Pause a specific cron timer
 * POST /:id/resume    - Resume a specific cron timer
 * POST /pause-all     - Pause all cron timers
 * POST /resume-all    - Resume all cron timers
 */

import { Router } from 'express';
import { createLogger } from '@protolabsai/utils';

import type { SchedulerService } from '../../../services/scheduler-service.js';
import type { EventEmitter } from '../../../lib/events.js';

const logger = createLogger('Routes:Timers');

export function createTimersRoutes(
  schedulerService: SchedulerService,
  events: EventEmitter
): Router {
  const router = Router();

  // GET / - List all cron + interval timers
  router.get('/', (_req, res) => {
    try {
      const timers = schedulerService.listAll();

      res.json({ timers, count: timers.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to list timers:', error);
      res.status(500).json({ error: message });
    }
  });

  // POST /pause-all - Pause all cron timers (must be before /:id routes)
  router.post('/pause-all', async (_req, res) => {
    try {
      const tasks = schedulerService.getAllTasks();
      let pausedCount = 0;

      for (const task of tasks) {
        if (task.enabled) {
          await schedulerService.disableTask(task.id);
          pausedCount++;
        }
      }

      events.emit('timer:all-paused', {
        count: pausedCount,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Paused ${pausedCount} timers via bulk pause-all`);
      res.json({ success: true, pausedCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to pause all timers:', error);
      res.status(500).json({ error: message });
    }
  });

  // POST /resume-all - Resume all cron timers (must be before /:id routes)
  router.post('/resume-all', async (_req, res) => {
    try {
      const tasks = schedulerService.getAllTasks();
      let resumedCount = 0;

      for (const task of tasks) {
        if (!task.enabled) {
          await schedulerService.enableTask(task.id);
          resumedCount++;
        }
      }

      events.emit('timer:all-resumed', {
        count: resumedCount,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Resumed ${resumedCount} timers via bulk resume-all`);
      res.json({ success: true, resumedCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to resume all timers:', error);
      res.status(500).json({ error: message });
    }
  });

  // POST /:id/pause - Pause a specific cron timer by ID
  router.post('/:id/pause', async (req, res) => {
    try {
      const id = req.params['id'] as string;
      const task = schedulerService.getTask(id);

      if (!task) {
        res.status(404).json({ error: `Timer not found: ${id}` });
        return;
      }

      if (!task.enabled) {
        res.json({ success: true, message: 'Timer is already paused' });
        return;
      }

      await schedulerService.disableTask(id);

      events.emit('timer:paused', {
        timerId: id,
        timerName: task.name,
        kind: 'cron',
        timestamp: new Date().toISOString(),
      });

      logger.info(`Paused timer "${task.name}" (${id})`);
      res.json({ success: true, id, name: task.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to pause timer ${req.params['id']}:`, error);
      res.status(500).json({ error: message });
    }
  });

  // POST /:id/resume - Resume a specific cron timer by ID
  router.post('/:id/resume', async (req, res) => {
    try {
      const id = req.params['id'] as string;
      const task = schedulerService.getTask(id);

      if (!task) {
        res.status(404).json({ error: `Timer not found: ${id}` });
        return;
      }

      if (task.enabled) {
        res.json({ success: true, message: 'Timer is already running' });
        return;
      }

      await schedulerService.enableTask(id);

      events.emit('timer:resumed', {
        timerId: id,
        timerName: task.name,
        kind: 'cron',
        timestamp: new Date().toISOString(),
      });

      logger.info(`Resumed timer "${task.name}" (${id})`);
      res.json({ success: true, id, name: task.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to resume timer ${req.params['id']}:`, error);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
