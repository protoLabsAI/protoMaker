/**
 * Unit tests for the pause/resume project route handlers (#4062).
 *
 * Verifies request validation (projectPath required) and that the handlers
 * delegate to ProjectPauseService and surface its result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createPauseHandler } from '@/routes/projects/routes/pause.js';
import { createResumeHandler } from '@/routes/projects/routes/resume.js';
import type { ProjectPauseService } from '@/services/project-pause-service.js';

function makeRes() {
  const res: Partial<Response> & { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: undefined,
  };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res as Response;
  }) as unknown as Response['status'];
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res as Response;
  }) as unknown as Response['json'];
  return res;
}

function makeReq(body: unknown): Request {
  return { body } as Request;
}

describe('pause/resume project route handlers (#4062)', () => {
  let pauseService: {
    pauseProject: ReturnType<typeof vi.fn>;
    resumeProject: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    pauseService = {
      pauseProject: vi.fn(),
      resumeProject: vi.fn(),
    };
  });

  describe('createPauseHandler', () => {
    it('returns 400 when projectPath is missing', async () => {
      const handler = createPauseHandler(pauseService as unknown as ProjectPauseService);
      const res = makeRes();
      await handler(makeReq({ reason: 'maintenance' }), res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'projectPath is required' });
      expect(pauseService.pauseProject).not.toHaveBeenCalled();
    });

    it('delegates to the service and returns the result on success', async () => {
      pauseService.pauseProject.mockResolvedValue({
        projectPath: '/app/a',
        slugsPaused: ['svc'],
        loopsStopped: 1,
        alreadyPaused: false,
      });
      const handler = createPauseHandler(pauseService as unknown as ProjectPauseService);
      const res = makeRes();
      await handler(makeReq({ projectPath: '/app/a', reason: 'maintenance' }), res as Response);

      expect(pauseService.pauseProject).toHaveBeenCalledWith('/app/a', 'maintenance');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        success: true,
        projectPath: '/app/a',
        slugsPaused: ['svc'],
        loopsStopped: 1,
        alreadyPaused: false,
      });
    });

    it('returns 500 when the service throws', async () => {
      pauseService.pauseProject.mockRejectedValue(new Error('boom'));
      const handler = createPauseHandler(pauseService as unknown as ProjectPauseService);
      const res = makeRes();
      await handler(makeReq({ projectPath: '/app/a' }), res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({ success: false });
    });
  });

  describe('createResumeHandler', () => {
    it('returns 400 when projectPath is missing', async () => {
      const handler = createResumeHandler(pauseService as unknown as ProjectPauseService);
      const res = makeRes();
      await handler(makeReq({}), res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'projectPath is required' });
      expect(pauseService.resumeProject).not.toHaveBeenCalled();
    });

    it('delegates to the service and returns the result on success', async () => {
      pauseService.resumeProject.mockResolvedValue({
        projectPath: '/app/a',
        slugsResumed: ['svc'],
        wasPaused: true,
      });
      const handler = createResumeHandler(pauseService as unknown as ProjectPauseService);
      const res = makeRes();
      await handler(makeReq({ projectPath: '/app/a' }), res as Response);

      expect(pauseService.resumeProject).toHaveBeenCalledWith('/app/a');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        success: true,
        projectPath: '/app/a',
        slugsResumed: ['svc'],
        wasPaused: true,
      });
    });
  });
});
