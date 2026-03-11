/**
 * Integration tests for calendar HTTP routes
 *
 * Tests the createCalendarRoutes factory directly — no HTTP server required.
 * Each test invokes route handlers through the Express router stack.
 *
 * Coverage:
 * - POST /list — date range and type filters
 * - POST /create — required field validation, job-specific field validation
 * - POST /update — returns updated event
 * - POST /delete — removes the event
 * - POST /run-job — rejects non-pending jobs, starts execution for pending jobs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock @protolabsai/platform so validatePath always allows paths in tests
vi.mock('@protolabsai/platform', () => ({
  validatePath: vi.fn(),
  PathNotAllowedError: class PathNotAllowedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PathNotAllowedError';
    }
  },
  getAutomakerDir: vi.fn((p: string) => `${p}/.automaker`),
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  atomicWriteJson: vi.fn(),
  readJsonWithRecovery: vi.fn(),
}));

import { createCalendarRoutes } from '@/routes/calendar/index.js';
import type { CalendarService } from '@/services/calendar-service.js';
import type { JobExecutorService } from '@/services/job-executor-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(body: Record<string, unknown> = {}): Request {
  return { body, headers: {}, params: {}, query: {} } as unknown as Request;
}

function makeRes() {
  const res = {
    _status: 200,
    json: vi.fn(),
    status: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

/**
 * Extract the last (actual route) handler from a router stack entry.
 * Express route stacks include middleware first; the last handle is the route handler.
 */
function getHandler(
  router: ReturnType<typeof createCalendarRoutes>,
  method: string,
  routePath: string
) {
  const stack = (
    router as unknown as {
      stack: Array<{
        route?: {
          path: string;
          stack: Array<{ method: string; handle: (req: Request, res: Response) => unknown }>;
        };
      }>;
    }
  ).stack;

  const layer = stack.find((l) => l.route?.path === routePath);
  if (!layer?.route) return undefined;

  // Return the last handle in the stack (the actual route handler, after middleware)
  const handles = layer.route.stack.filter((s) => s.method === method);
  return handles[handles.length - 1]?.handle;
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMockCalendarService(overrides: Partial<CalendarService> = {}): CalendarService {
  return {
    listEvents: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue({
      id: 'event-123',
      projectPath: '/test/project',
      title: 'Test Event',
      date: '2026-03-10',
      type: 'milestone',
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
    }),
    updateEvent: vi.fn().mockResolvedValue({
      id: 'event-123',
      projectPath: '/test/project',
      title: 'Updated Event',
      date: '2026-03-15',
      type: 'milestone',
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
    }),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    getDueJobs: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as CalendarService;
}

function makeMockJobExecutorService(
  overrides: Partial<JobExecutorService> = {}
): JobExecutorService {
  return {
    executeJob: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as JobExecutorService;
}

const PROJECT_PATH = '/test/project';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calendar routes', () => {
  let calendarService: CalendarService;
  let jobExecutorService: JobExecutorService;
  let router: ReturnType<typeof createCalendarRoutes>;

  beforeEach(() => {
    calendarService = makeMockCalendarService();
    jobExecutorService = makeMockJobExecutorService();
    router = createCalendarRoutes(calendarService, jobExecutorService);
  });

  // -------------------------------------------------------------------------
  // POST /list
  // -------------------------------------------------------------------------

  describe('POST /list', () => {
    it('returns events with no filters', async () => {
      const events = [
        {
          id: 'event-1',
          projectPath: PROJECT_PATH,
          title: 'Event 1',
          date: '2026-03-10',
          type: 'milestone',
          createdAt: '2026-03-10T00:00:00.000Z',
          updatedAt: '2026-03-10T00:00:00.000Z',
        },
      ];
      vi.mocked(calendarService.listEvents).mockResolvedValue(events as any);

      const req = makeReq({ projectPath: PROJECT_PATH });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/list');
      expect(handler).toBeDefined();
      await handler!(req, res as Response);

      expect(calendarService.listEvents).toHaveBeenCalledWith(PROJECT_PATH, {
        startDate: undefined,
        endDate: undefined,
        types: undefined,
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, events });
    });

    it('passes date range to calendarService.listEvents', async () => {
      const req = makeReq({
        projectPath: PROJECT_PATH,
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/list');
      await handler!(req, res as Response);

      expect(calendarService.listEvents).toHaveBeenCalledWith(PROJECT_PATH, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        types: undefined,
      });
    });

    it('passes type filters to calendarService.listEvents', async () => {
      const req = makeReq({
        projectPath: PROJECT_PATH,
        types: ['milestone', 'feature'],
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/list');
      await handler!(req, res as Response);

      expect(calendarService.listEvents).toHaveBeenCalledWith(PROJECT_PATH, {
        startDate: undefined,
        endDate: undefined,
        types: ['milestone', 'feature'],
      });
    });

    it('passes both date range and type filters together', async () => {
      const req = makeReq({
        projectPath: PROJECT_PATH,
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        types: ['job'],
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/list');
      await handler!(req, res as Response);

      expect(calendarService.listEvents).toHaveBeenCalledWith(PROJECT_PATH, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        types: ['job'],
      });
    });

    it('returns 400 when projectPath is missing', async () => {
      const req = makeReq({});
      const res = makeRes();

      const handler = getHandler(router, 'post', '/list');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'projectPath is required',
      });
    });

    it('returns 500 when calendarService.listEvents throws', async () => {
      vi.mocked(calendarService.listEvents).mockRejectedValue(new Error('DB read failed'));

      const req = makeReq({ projectPath: PROJECT_PATH });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/list');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'DB read failed' });
    });
  });

  // -------------------------------------------------------------------------
  // POST /create
  // -------------------------------------------------------------------------

  describe('POST /create', () => {
    it('creates a non-job event with all required fields', async () => {
      const createdEvent = {
        id: 'event-abc',
        projectPath: PROJECT_PATH,
        title: 'Sprint Review',
        date: '2026-03-20',
        type: 'milestone',
        createdAt: '2026-03-10T00:00:00.000Z',
        updatedAt: '2026-03-10T00:00:00.000Z',
      };
      vi.mocked(calendarService.createEvent).mockResolvedValue(createdEvent as any);

      const req = makeReq({
        projectPath: PROJECT_PATH,
        title: 'Sprint Review',
        date: '2026-03-20',
        type: 'milestone',
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        PROJECT_PATH,
        expect.objectContaining({ title: 'Sprint Review', date: '2026-03-20', type: 'milestone' })
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, event: createdEvent });
    });

    it('returns 400 when projectPath is missing', async () => {
      const req = makeReq({ title: 'Event', date: '2026-03-20', type: 'milestone' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'projectPath is required' });
    });

    it('returns 400 when title is missing', async () => {
      const req = makeReq({ projectPath: PROJECT_PATH, date: '2026-03-20', type: 'milestone' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'title is required' });
    });

    it('returns 400 when date is missing', async () => {
      const req = makeReq({
        projectPath: PROJECT_PATH,
        title: 'Event',
        type: 'milestone',
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'date is required' });
    });

    it('returns 400 when type is missing', async () => {
      const req = makeReq({ projectPath: PROJECT_PATH, title: 'Event', date: '2026-03-20' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'type is required' });
    });

    it('returns 400 when type is job but time is missing', async () => {
      const req = makeReq({
        projectPath: PROJECT_PATH,
        title: 'Nightly Build',
        date: '2026-03-20',
        type: 'job',
        jobAction: { type: 'run-command', command: 'npm run build' },
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'time is required for job events',
      });
    });

    it('returns 400 when type is job but jobAction is missing', async () => {
      const req = makeReq({
        projectPath: PROJECT_PATH,
        title: 'Nightly Build',
        date: '2026-03-20',
        type: 'job',
        time: '02:00',
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'jobAction is required for job events',
      });
    });

    it('returns 400 when type is job but jobAction.type is missing', async () => {
      const req = makeReq({
        projectPath: PROJECT_PATH,
        title: 'Nightly Build',
        date: '2026-03-20',
        type: 'job',
        time: '02:00',
        jobAction: {},
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'jobAction is required for job events',
      });
    });

    it('creates a job event with all required job-specific fields', async () => {
      const jobEvent = {
        id: 'event-job-1',
        projectPath: PROJECT_PATH,
        title: 'Nightly Build',
        date: '2026-03-20',
        time: '02:00',
        type: 'job',
        jobAction: { type: 'run-command', command: 'npm run build' },
        jobStatus: 'pending',
        createdAt: '2026-03-10T00:00:00.000Z',
        updatedAt: '2026-03-10T00:00:00.000Z',
      };
      vi.mocked(calendarService.createEvent).mockResolvedValue(jobEvent as any);

      const req = makeReq({
        projectPath: PROJECT_PATH,
        title: 'Nightly Build',
        date: '2026-03-20',
        type: 'job',
        time: '02:00',
        jobAction: { type: 'run-command', command: 'npm run build' },
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(calendarService.createEvent).toHaveBeenCalledWith(
        PROJECT_PATH,
        expect.objectContaining({
          type: 'job',
          time: '02:00',
          jobStatus: 'pending',
          jobAction: { type: 'run-command', command: 'npm run build' },
        })
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, event: jobEvent });
    });

    it('returns 500 when calendarService.createEvent throws', async () => {
      vi.mocked(calendarService.createEvent).mockRejectedValue(new Error('Write failed'));

      const req = makeReq({
        projectPath: PROJECT_PATH,
        title: 'Event',
        date: '2026-03-20',
        type: 'milestone',
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/create');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Write failed' });
    });
  });

  // -------------------------------------------------------------------------
  // POST /update
  // -------------------------------------------------------------------------

  describe('POST /update', () => {
    it('updates an event and returns the updated event', async () => {
      const updatedEvent = {
        id: 'event-123',
        projectPath: PROJECT_PATH,
        title: 'Updated Title',
        date: '2026-03-25',
        type: 'milestone',
        createdAt: '2026-03-10T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
      };
      vi.mocked(calendarService.updateEvent).mockResolvedValue(updatedEvent as any);

      const req = makeReq({
        projectPath: PROJECT_PATH,
        id: 'event-123',
        title: 'Updated Title',
        date: '2026-03-25',
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/update');
      await handler!(req, res as Response);

      expect(calendarService.updateEvent).toHaveBeenCalledWith(
        PROJECT_PATH,
        'event-123',
        expect.objectContaining({ title: 'Updated Title', date: '2026-03-25' })
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, event: updatedEvent });
    });

    it('returns 400 when projectPath is missing', async () => {
      const req = makeReq({ id: 'event-123', title: 'Updated' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/update');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'projectPath is required' });
    });

    it('returns 400 when id is missing', async () => {
      const req = makeReq({ projectPath: PROJECT_PATH, title: 'Updated' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/update');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'id is required' });
    });

    it('does not pass projectPath or id as update fields', async () => {
      const req = makeReq({
        projectPath: PROJECT_PATH,
        id: 'event-123',
        title: 'Updated',
      });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/update');
      await handler!(req, res as Response);

      const updateArg = vi.mocked(calendarService.updateEvent).mock.calls[0]?.[2];
      expect(updateArg).not.toHaveProperty('projectPath');
      expect(updateArg).not.toHaveProperty('id');
    });

    it('returns 500 when calendarService.updateEvent throws', async () => {
      vi.mocked(calendarService.updateEvent).mockRejectedValue(
        new Error('Calendar event event-999 not found')
      );

      const req = makeReq({ projectPath: PROJECT_PATH, id: 'event-999', title: 'X' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/update');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Calendar event event-999 not found',
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /delete
  // -------------------------------------------------------------------------

  describe('POST /delete', () => {
    it('deletes an event and returns success', async () => {
      const req = makeReq({ projectPath: PROJECT_PATH, id: 'event-123' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/delete');
      await handler!(req, res as Response);

      expect(calendarService.deleteEvent).toHaveBeenCalledWith(PROJECT_PATH, 'event-123');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 400 when projectPath is missing', async () => {
      const req = makeReq({ id: 'event-123' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/delete');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'projectPath is required' });
    });

    it('returns 400 when id is missing', async () => {
      const req = makeReq({ projectPath: PROJECT_PATH });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/delete');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'id is required' });
    });

    it('returns 500 when calendarService.deleteEvent throws', async () => {
      vi.mocked(calendarService.deleteEvent).mockRejectedValue(
        new Error('Calendar event event-999 not found')
      );

      const req = makeReq({ projectPath: PROJECT_PATH, id: 'event-999' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/delete');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Calendar event event-999 not found',
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /run-job
  // -------------------------------------------------------------------------

  describe('POST /run-job', () => {
    const pendingJob = {
      id: 'job-1',
      projectPath: PROJECT_PATH,
      title: 'Nightly Build',
      date: '2026-03-20',
      time: '02:00',
      type: 'job',
      jobAction: { type: 'run-command', command: 'npm run build' },
      jobStatus: 'pending',
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
    };

    it('starts execution for a pending job and returns success immediately', async () => {
      vi.mocked(calendarService.listEvents).mockResolvedValue([pendingJob] as any);

      const req = makeReq({ projectPath: PROJECT_PATH, id: 'job-1' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/run-job');
      await handler!(req, res as Response);

      expect(jobExecutorService.executeJob).toHaveBeenCalledWith(PROJECT_PATH, pendingJob);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Job execution started' });
    });

    it('rejects a job that is not pending (running status)', async () => {
      const runningJob = { ...pendingJob, jobStatus: 'running' };
      vi.mocked(calendarService.listEvents).mockResolvedValue([runningJob] as any);

      const req = makeReq({ projectPath: PROJECT_PATH, id: 'job-1' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/run-job');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Job is not pending (status: running)',
      });
      expect(jobExecutorService.executeJob).not.toHaveBeenCalled();
    });

    it('rejects a job that is not pending (completed status)', async () => {
      const completedJob = { ...pendingJob, jobStatus: 'completed' };
      vi.mocked(calendarService.listEvents).mockResolvedValue([completedJob] as any);

      const req = makeReq({ projectPath: PROJECT_PATH, id: 'job-1' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/run-job');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Job is not pending (status: completed)',
      });
    });

    it('returns 404 when event is not found', async () => {
      vi.mocked(calendarService.listEvents).mockResolvedValue([]);

      const req = makeReq({ projectPath: PROJECT_PATH, id: 'missing-job' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/run-job');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event missing-job not found',
      });
    });

    it('returns 400 when event is not a job type', async () => {
      const milestoneEvent = {
        ...pendingJob,
        type: 'milestone',
        jobStatus: undefined,
      };
      vi.mocked(calendarService.listEvents).mockResolvedValue([milestoneEvent] as any);

      const req = makeReq({ projectPath: PROJECT_PATH, id: 'job-1' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/run-job');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event is not a job',
      });
    });

    it('returns 400 when projectPath is missing', async () => {
      const req = makeReq({ id: 'job-1' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/run-job');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'projectPath is required' });
    });

    it('returns 400 when id is missing', async () => {
      const req = makeReq({ projectPath: PROJECT_PATH });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/run-job');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'id is required' });
    });

    it('returns 500 when calendarService.listEvents throws', async () => {
      vi.mocked(calendarService.listEvents).mockRejectedValue(new Error('Read error'));

      const req = makeReq({ projectPath: PROJECT_PATH, id: 'job-1' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/run-job');
      await handler!(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Read error' });
    });

    it('does not await executeJob — responds immediately even if execution would take long', async () => {
      // executeJob never resolves during this test
      vi.mocked(calendarService.listEvents).mockResolvedValue([pendingJob] as any);
      vi.mocked(jobExecutorService.executeJob).mockReturnValue(new Promise(() => {}));

      const req = makeReq({ projectPath: PROJECT_PATH, id: 'job-1' });
      const res = makeRes();

      const handler = getHandler(router, 'post', '/run-job');
      await handler!(req, res as Response);

      // Response should already be sent without awaiting executeJob
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Job execution started' });
    });
  });
});
