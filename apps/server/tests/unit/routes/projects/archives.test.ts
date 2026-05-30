/**
 * Unit tests for the archived-feature read endpoints (#4025).
 *
 * Covers the wiring between the routes and ArchiveQueryService (the read side
 * of archival, previously write-only) and the input/404 guards.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createMockExpressContext } from '../../../utils/mocks.js';
import {
  createArchivesListHandler,
  createArchivesDetailHandler,
} from '@/routes/projects/routes/archives.js';
import type { ArchiveQueryService } from '@/services/archive-query-service.js';

function mockArchiveQuery(overrides: Partial<ArchiveQueryService> = {}): ArchiveQueryService {
  return {
    listArchivedFeatures: vi.fn().mockResolvedValue([]),
    getArchivedFeatureDetail: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as ArchiveQueryService;
}

describe('archives read endpoints', () => {
  describe('POST /archives/list', () => {
    it('returns the archived features for a project', async () => {
      const summaries = [{ featureId: 'f1', title: 'Old feature', status: 'done' }];
      const archiveQuery = mockArchiveQuery({
        listArchivedFeatures: vi.fn().mockResolvedValue(summaries),
      });
      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/p', projectSlug: 'proj', dateFrom: '2026-01-01' };

      await createArchivesListHandler(archiveQuery)(req as Request, res as Response);

      expect(archiveQuery.listArchivedFeatures).toHaveBeenCalledWith({
        projectPath: '/p',
        projectSlug: 'proj',
        dateFrom: '2026-01-01',
        dateTo: undefined,
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, archives: summaries });
    });

    it('400s when projectPath is missing', async () => {
      const archiveQuery = mockArchiveQuery();
      const { req, res } = createMockExpressContext();
      req.body = {};

      await createArchivesListHandler(archiveQuery)(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(archiveQuery.listArchivedFeatures).not.toHaveBeenCalled();
    });
  });

  describe('POST /archives/detail', () => {
    it('returns the archived feature detail', async () => {
      const detail = { featureId: 'f1', feature: {}, agentOutput: null, meta: {} };
      const archiveQuery = mockArchiveQuery({
        getArchivedFeatureDetail: vi.fn().mockResolvedValue(detail),
      });
      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/p', featureId: 'f1' };

      await createArchivesDetailHandler(archiveQuery)(req as Request, res as Response);

      expect(archiveQuery.getArchivedFeatureDetail).toHaveBeenCalledWith('/p', 'f1');
      expect(res.json).toHaveBeenCalledWith({ success: true, archive: detail });
    });

    it('404s when the archived feature is not found', async () => {
      const archiveQuery = mockArchiveQuery({
        getArchivedFeatureDetail: vi.fn().mockResolvedValue(null),
      });
      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/p', featureId: 'missing' };

      await createArchivesDetailHandler(archiveQuery)(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('400s when projectPath or featureId is missing', async () => {
      const archiveQuery = mockArchiveQuery();
      const { req, res } = createMockExpressContext();
      req.body = { projectPath: '/p' };

      await createArchivesDetailHandler(archiveQuery)(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(archiveQuery.getArchivedFeatureDetail).not.toHaveBeenCalled();
    });
  });
});
