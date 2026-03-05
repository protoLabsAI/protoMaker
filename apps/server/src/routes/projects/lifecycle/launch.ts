/**
 * POST /lifecycle/launch - Start auto-mode for a project
 */

import type { Request, Response } from 'express';
import type { ProjectLifecycleService } from '../../../services/project-lifecycle-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createLaunchHandler(lifecycleService: ProjectLifecycleService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, maxConcurrency } = req.body as {
        projectPath: string;
        projectSlug: string;
        maxConcurrency?: number;
      };

      if (!projectPath || !projectSlug) {
        res.status(400).json({ success: false, error: 'projectPath and projectSlug are required' });
        return;
      }

      const result = await lifecycleService.launch(projectPath, projectSlug, maxConcurrency);
      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'Launch project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
