/**
 * Archive Routes — REST API for querying archived features.
 *
 * Endpoints:
 *   GET /api/archive/features
 *     Query params: projectPath (required), dateFrom?, dateTo?, projectSlug?
 *     Returns: { features: ArchivedFeatureSummary[] }
 *
 *   GET /api/archive/features/:id
 *     Query params: projectPath (required)
 *     Returns: { detail: ArchivedFeatureDetail }
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { ArchiveQueryService } from '../../services/archive-query-service.js';

const logger = createLogger('ArchiveRoutes');

export function createArchiveRoutes(archiveQueryService: ArchiveQueryService): Router {
  const router = Router();

  /**
   * GET /api/archive/features
   * List archived features for a project, with optional filters.
   */
  router.get('/features', async (req: Request, res: Response) => {
    try {
      const query = req.query as Record<string, string | string[] | undefined>;
      const projectPath = Array.isArray(query.projectPath)
        ? query.projectPath[0]
        : query.projectPath;
      const dateFrom = Array.isArray(query.dateFrom) ? query.dateFrom[0] : query.dateFrom;
      const dateTo = Array.isArray(query.dateTo) ? query.dateTo[0] : query.dateTo;
      const projectSlug = Array.isArray(query.projectSlug)
        ? query.projectSlug[0]
        : query.projectSlug;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath query parameter is required' });
        return;
      }

      const features = await archiveQueryService.listArchivedFeatures({
        projectPath,
        dateFrom,
        dateTo,
        projectSlug,
      });

      res.json({ features });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list archived features:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/archive/features/:id
   * Load full archived feature data (feature.json + agent-output.md).
   */
  router.get('/features/:id', async (req: Request, res: Response) => {
    try {
      const featureId = String(req.params['id'] ?? '');
      const rawProjectPath = req.query['projectPath'];
      const projectPath = typeof rawProjectPath === 'string' ? rawProjectPath : undefined;

      if (!projectPath) {
        res.status(400).json({ error: 'projectPath query parameter is required' });
        return;
      }

      const detail = await archiveQueryService.getArchivedFeatureDetail(projectPath, featureId);
      if (!detail) {
        res.status(404).json({ error: `Archived feature '${featureId}' not found` });
        return;
      }

      res.json({ detail });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to load archived feature ${String(req.params['id'])}:`, error);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
