/**
 * Archived-feature read endpoints (#4025).
 *
 *   POST /archives/list   — archived features for a project (optional date range)
 *   POST /archives/detail — full archived feature.json + agent output + meta
 *
 * The read side of the archival lifecycle: features are WRITTEN to the archive
 * by ArchivalService; these expose them for read-back (audit / UI). Before this,
 * ArchiveQueryService had no live consumer — archives were write-only.
 */

import type { Request, Response } from 'express';
import type { ArchiveQueryService } from '../../../services/archive-query-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createArchivesListHandler(archiveQuery: ArchiveQueryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, dateFrom, dateTo } = req.body as {
        projectPath: string;
        projectSlug?: string;
        dateFrom?: string;
        dateTo?: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const archives = await archiveQuery.listArchivedFeatures({
        projectPath,
        projectSlug,
        dateFrom,
        dateTo,
      });
      res.json({ success: true, archives });
    } catch (error) {
      logError(error, 'List archived features failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createArchivesDetailHandler(archiveQuery: ArchiveQueryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({ success: false, error: 'projectPath and featureId are required' });
        return;
      }

      const archive = await archiveQuery.getArchivedFeatureDetail(projectPath, featureId);
      if (!archive) {
        res.status(404).json({ success: false, error: `No archived feature "${featureId}"` });
        return;
      }
      res.json({ success: true, archive });
    } catch (error) {
      logError(error, 'Get archived feature detail failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
