/**
 * Unit tests for Timer Registry API routes
 *
 * Verifies GET /api/ops/timers, POST pause/resume (individual and bulk),
 * and WebSocket event emission on state changes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { SchedulerService } from '@/services/scheduler-service.js';
import { createTimersRoutes } from '@/routes/ops/routes/timers.js';
import { createMockExpressContext } from '../../../utils/mocks.js';

/** Minimal EventEmitter stub that tracks emitted events */
function makeEvents() {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(),
    on: vi.fn(),
    broadcast: vi.fn(),
  };
}

/**
 * Helper: extract the route handler for a given method + path from the Express Router.
 * Router.stack entries contain { route: { path, methods, stack: [{ handle }] } }.
 */
function getHandler(
  router: ReturnType<typeof createTimersRoutes>,
  method: 'get' | 'post',
  path: string
): (req: Request, res: Response) => Promise<void> | void {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} handler found for path "${path}"`);
  }
  return layer.route.stack[0].handle;
}

describe('Timer Registry API routes', () => {
  let scheduler: SchedulerService;
  let events: ReturnType<typeof makeEvents>;
  let router: ReturnType<typeof createTimersRoutes>;

  beforeEach(async () => {
    vi.useFakeTimers();
    scheduler = new SchedulerService();
    events = makeEvents();
    router = createTimersRoutes(scheduler, events as any);

    // Register some test cron tasks
    await scheduler.registerTask('task-a', 'Task A', '*/5 * * * *', () => {}, true);
    await scheduler.registerTask('task-b', 'Task B', '0 * * * *', () => {}, true);
  });

  afterEach(() => {
    scheduler.destroy();
    vi.useRealTimers();
  });

  describe('GET / - list all timers', () => {
    it('returns cron tasks', () => {
      const { req, res } = createMockExpressContext();
      const handler = getHandler(router, 'get', '/');

      handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.timers).toHaveLength(2);
      expect(payload.count).toBe(2);
      expect(payload.timers[0].type).toBe('cron');
      expect(payload.timers[0].id).toBe('task-a');
    });

    it('returns interval entries when registered', () => {
      scheduler.registerInterval('int-1', 'Interval One', 5000, () => {});

      const { req, res } = createMockExpressContext();
      const handler = getHandler(router, 'get', '/');

      handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.count).toBe(3);

      const intervalEntry = payload.timers.find((t: any) => t.type === 'interval');
      expect(intervalEntry).toBeDefined();
      expect(intervalEntry.id).toBe('int-1');
      expect(intervalEntry.intervalMs).toBe(5000);
    });
  });

  describe('POST /:id/pause - pause a timer', () => {
    it('pauses an enabled cron timer', async () => {
      const { req, res } = createMockExpressContext();
      req.params = { id: 'task-a' };
      const handler = getHandler(router, 'post', '/:id/pause');

      await handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.id).toBe('task-a');

      // Verify the task is actually disabled
      const task = scheduler.getTask('task-a');
      expect(task?.enabled).toBe(false);

      // Verify WebSocket event emitted
      expect(events.emit).toHaveBeenCalledWith(
        'timer:paused',
        expect.objectContaining({
          timerId: 'task-a',
          timerName: 'Task A',
          kind: 'cron',
        })
      );
    });

    it('returns success for already-paused timer', async () => {
      await scheduler.disableTask('task-a');

      const { req, res } = createMockExpressContext();
      req.params = { id: 'task-a' };
      const handler = getHandler(router, 'post', '/:id/pause');

      await handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.message).toBe('Timer is already paused');
    });

    it('returns 404 for unknown timer', async () => {
      const { req, res } = createMockExpressContext();
      req.params = { id: 'nonexistent' };
      const handler = getHandler(router, 'post', '/:id/pause');

      await handler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /:id/resume - resume a timer', () => {
    it('resumes a paused cron timer', async () => {
      await scheduler.disableTask('task-b');

      const { req, res } = createMockExpressContext();
      req.params = { id: 'task-b' };
      const handler = getHandler(router, 'post', '/:id/resume');

      await handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.id).toBe('task-b');

      // Verify the task is actually enabled
      const task = scheduler.getTask('task-b');
      expect(task?.enabled).toBe(true);

      // Verify WebSocket event emitted
      expect(events.emit).toHaveBeenCalledWith(
        'timer:resumed',
        expect.objectContaining({
          timerId: 'task-b',
          timerName: 'Task B',
          kind: 'cron',
        })
      );
    });

    it('returns success for already-running timer', async () => {
      const { req, res } = createMockExpressContext();
      req.params = { id: 'task-a' };
      const handler = getHandler(router, 'post', '/:id/resume');

      await handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.message).toBe('Timer is already running');
    });

    it('returns 404 for unknown timer', async () => {
      const { req, res } = createMockExpressContext();
      req.params = { id: 'nonexistent' };
      const handler = getHandler(router, 'post', '/:id/resume');

      await handler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /pause-all - bulk pause', () => {
    it('pauses all enabled cron timers', async () => {
      const { req, res } = createMockExpressContext();
      const handler = getHandler(router, 'post', '/pause-all');

      await handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.pausedCount).toBe(2);

      // Both tasks should be disabled
      expect(scheduler.getTask('task-a')?.enabled).toBe(false);
      expect(scheduler.getTask('task-b')?.enabled).toBe(false);

      // Verify WebSocket event emitted
      expect(events.emit).toHaveBeenCalledWith(
        'timer:all-paused',
        expect.objectContaining({ count: 2 })
      );
    });

    it('reports zero when all timers are already paused', async () => {
      await scheduler.disableTask('task-a');
      await scheduler.disableTask('task-b');

      const { req, res } = createMockExpressContext();
      const handler = getHandler(router, 'post', '/pause-all');

      await handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.pausedCount).toBe(0);
    });
  });

  describe('POST /resume-all - bulk resume', () => {
    it('resumes all paused cron timers', async () => {
      await scheduler.disableTask('task-a');
      await scheduler.disableTask('task-b');

      const { req, res } = createMockExpressContext();
      const handler = getHandler(router, 'post', '/resume-all');

      await handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.resumedCount).toBe(2);

      // Both tasks should be enabled
      expect(scheduler.getTask('task-a')?.enabled).toBe(true);
      expect(scheduler.getTask('task-b')?.enabled).toBe(true);

      // Verify WebSocket event emitted
      expect(events.emit).toHaveBeenCalledWith(
        'timer:all-resumed',
        expect.objectContaining({ count: 2 })
      );
    });

    it('reports zero when all timers are already running', async () => {
      const { req, res } = createMockExpressContext();
      const handler = getHandler(router, 'post', '/resume-all');

      await handler(req as Request, res as Response);

      const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.resumedCount).toBe(0);
    });
  });
});
