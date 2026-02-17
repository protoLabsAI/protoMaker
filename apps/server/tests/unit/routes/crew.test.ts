/**
 * Crew Status Route Tests
 *
 * Validates GET /api/crew/status response shape.
 * The client transforms Record<string, member> into an array — these tests
 * ensure the server contract matches what the client expects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createGetStatusHandler } from '@/routes/crew/routes/get-status.js';
import type { CrewLoopService, CrewStatus } from '@/services/crew-loop-service.js';
import { createMockExpressContext } from '../../utils/mocks.js';

describe('crew routes', () => {
  let mockCrewLoopService: Partial<CrewLoopService>;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCrewLoopService = {
      getStatus: vi.fn(),
    };

    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  describe('GET /status', () => {
    it('should return members as Record<string, object> (not array)', async () => {
      // This test exists because the client crashed when members was assumed to be
      // an array. The server returns Record<string, member> and the client must
      // transform it. If this test breaks, the client will crash.
      const mockStatus: CrewStatus = {
        enabled: true,
        members: {
          frank: {
            id: 'frank',
            displayName: 'Frank',
            templateName: 'frank',
            defaultSchedule: '*/10 * * * *',
            enabled: true,
            schedule: '*/10 * * * *',
            running: false,
            checkCount: 3,
            escalationCount: 0,
          },
        },
      };
      vi.mocked(mockCrewLoopService.getStatus!).mockReturnValue(mockStatus);

      const handler = createGetStatusHandler(mockCrewLoopService as CrewLoopService);
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];

      // Critical shape assertion: members MUST be a Record, NOT an array
      expect(response.success).toBe(true);
      expect(response.members).toBeDefined();
      expect(Array.isArray(response.members)).toBe(false);
      expect(typeof response.members).toBe('object');
      expect(response.members.frank).toBeDefined();
      expect(response.members.frank.id).toBe('frank');
    });

    it('should include all required member fields', async () => {
      const mockStatus: CrewStatus = {
        enabled: true,
        members: {
          ava: {
            id: 'ava',
            displayName: 'Ava',
            templateName: 'ava',
            defaultSchedule: '*/10 * * * *',
            enabled: true,
            schedule: '*/10 * * * *',
            running: true,
            lastCheck: {
              timestamp: '2026-02-17T20:00:00Z',
              result: { severity: 'ok', title: 'All clear', findings: [] },
              durationMs: 150,
            },
            lastEscalation: {
              timestamp: '2026-02-17T19:00:00Z',
              result: { success: true, output: 'Fixed' },
              durationMs: 5000,
            },
            checkCount: 42,
            escalationCount: 3,
          },
        },
      };
      vi.mocked(mockCrewLoopService.getStatus!).mockReturnValue(mockStatus);

      const handler = createGetStatusHandler(mockCrewLoopService as CrewLoopService);
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      const ava = response.members.ava;

      // Validate field names the client depends on
      expect(ava).toHaveProperty('id');
      expect(ava).toHaveProperty('running'); // NOT "isRunning"
      expect(ava).toHaveProperty('enabled');
      expect(ava).toHaveProperty('schedule');
      expect(ava).toHaveProperty('lastCheck');
      expect(ava.lastCheck).toHaveProperty('timestamp'); // NOT "lastCheckTime"
      expect(ava.lastCheck).toHaveProperty('result');
      expect(ava.lastCheck.result).toHaveProperty('severity'); // nested in lastCheck.result
      expect(ava).toHaveProperty('checkCount');
      expect(ava).toHaveProperty('escalationCount');
    });

    it('should return empty members object when no crew members registered', async () => {
      const mockStatus: CrewStatus = {
        enabled: true,
        members: {},
      };
      vi.mocked(mockCrewLoopService.getStatus!).mockReturnValue(mockStatus);

      const handler = createGetStatusHandler(mockCrewLoopService as CrewLoopService);
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        enabled: true,
        members: {},
      });
    });

    it('should return system enabled status', async () => {
      const mockStatus: CrewStatus = {
        enabled: false,
        members: {},
      };
      vi.mocked(mockCrewLoopService.getStatus!).mockReturnValue(mockStatus);

      const handler = createGetStatusHandler(mockCrewLoopService as CrewLoopService);
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.enabled).toBe(false);
    });

    it('should handle members without optional lastCheck/lastEscalation', async () => {
      const mockStatus: CrewStatus = {
        enabled: true,
        members: {
          'board-janitor': {
            id: 'board-janitor',
            displayName: 'Board Janitor',
            templateName: 'board-janitor',
            defaultSchedule: '*/15 * * * *',
            enabled: true,
            schedule: '*/15 * * * *',
            running: false,
            checkCount: 0,
            escalationCount: 0,
            // No lastCheck or lastEscalation — fresh member
          },
        },
      };
      vi.mocked(mockCrewLoopService.getStatus!).mockReturnValue(mockStatus);

      const handler = createGetStatusHandler(mockCrewLoopService as CrewLoopService);
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      const janitor = response.members['board-janitor'];
      expect(janitor.lastCheck).toBeUndefined();
      expect(janitor.lastEscalation).toBeUndefined();
      expect(janitor.running).toBe(false);
    });

    it('should handle service errors gracefully', async () => {
      vi.mocked(mockCrewLoopService.getStatus!).mockImplementation(() => {
        throw new Error('CrewLoopService not initialized');
      });

      const handler = createGetStatusHandler(mockCrewLoopService as CrewLoopService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'CrewLoopService not initialized',
      });
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(mockCrewLoopService.getStatus!).mockImplementation(() => {
        throw 'unexpected string error';
      });

      const handler = createGetStatusHandler(mockCrewLoopService as CrewLoopService);
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'unexpected string error',
      });
    });

    it('should return multiple crew members keyed by id', async () => {
      const mockStatus: CrewStatus = {
        enabled: true,
        members: {
          ava: {
            id: 'ava',
            displayName: 'Ava',
            templateName: 'ava',
            defaultSchedule: '*/10 * * * *',
            enabled: true,
            schedule: '*/10 * * * *',
            running: false,
            checkCount: 10,
            escalationCount: 1,
          },
          frank: {
            id: 'frank',
            displayName: 'Frank',
            templateName: 'frank',
            defaultSchedule: '*/10 * * * *',
            enabled: true,
            schedule: '*/10 * * * *',
            running: true,
            checkCount: 8,
            escalationCount: 0,
          },
          'pr-maintainer': {
            id: 'pr-maintainer',
            displayName: 'PR Maintainer',
            templateName: 'pr-maintainer',
            defaultSchedule: '*/10 * * * *',
            enabled: false,
            schedule: '*/10 * * * *',
            running: false,
            checkCount: 0,
            escalationCount: 0,
          },
        },
      };
      vi.mocked(mockCrewLoopService.getStatus!).mockReturnValue(mockStatus);

      const handler = createGetStatusHandler(mockCrewLoopService as CrewLoopService);
      await handler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(Object.keys(response.members)).toHaveLength(3);
      expect(response.members.ava.running).toBe(false);
      expect(response.members.frank.running).toBe(true);
      expect(response.members['pr-maintainer'].enabled).toBe(false);
    });
  });
});
