/**
 * Sync Project to Linear Endpoint
 *
 * POST /api/linear/sync-project
 *
 * Syncs Automaker project milestones to Linear project milestones,
 * matches issues to milestones by epic title, and assigns them.
 *
 * Request body:
 * {
 *   projectPath: string;
 *   projectSlug: string;
 *   linearProjectId?: string;
 *   cleanupPlaceholders?: boolean;
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   linearProjectId: string;
 *   milestones: Array<{ name, linearMilestoneId, action }>;
 *   issuesAssigned: number;
 *   deletedPlaceholders: string[];
 *   errors: string[];
 * }
 */

import type { RequestHandler } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { linearSyncService } from '../../services/linear-sync-service.js';

const logger = createLogger('SyncProject');

interface SyncProjectRequest {
  projectPath: string;
  projectSlug: string;
  linearProjectId?: string;
  cleanupPlaceholders?: boolean;
}

/**
 * Create sync project handler
 *
 * @returns Express request handler
 */
export function createSyncProjectHandler(): RequestHandler {
  return async (req, res) => {
    const { projectPath, projectSlug, linearProjectId, cleanupPlaceholders } =
      req.body as SyncProjectRequest;

    if (!projectPath || !projectSlug) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: projectPath, projectSlug',
      });
      return;
    }

    logger.info(`Starting project sync: ${projectSlug} → Linear`);

    try {
      const result = await linearSyncService.syncProjectToLinear(projectPath, projectSlug, {
        linearProjectId,
        cleanupPlaceholders,
      });

      res.json(result);
    } catch (error) {
      logger.error('Error syncing project to Linear:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error syncing project',
      });
    }
  };
}
