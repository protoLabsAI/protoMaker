/**
 * POST /lifecycle/collect-related - Collect related Linear issues into the project
 */

import type { Request, Response } from 'express';
import type { ProjectLifecycleService } from '../../../services/project-lifecycle-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createCollectRelatedHandler(lifecycleService: ProjectLifecycleService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, linearProjectId, issueIds } = req.body as {
        projectPath: string;
        projectSlug: string;
        linearProjectId: string;
        issueIds: string[];
      };

      if (!projectPath || !projectSlug) {
        res.status(400).json({ success: false, error: 'projectPath and projectSlug are required' });
        return;
      }
      if (!linearProjectId) {
        res.status(400).json({ success: false, error: 'linearProjectId is required' });
        return;
      }
      if (!issueIds || issueIds.length === 0) {
        res.status(400).json({ success: false, error: 'issueIds array is required' });
        return;
      }

      const result = await lifecycleService.collectRelated(
        projectPath,
        projectSlug,
        linearProjectId,
        issueIds
      );
      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'Collect related issues failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
