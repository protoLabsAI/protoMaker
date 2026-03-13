/**
 * POST /lifecycle/research - Trigger deep research for a project
 */

import type { Request, Response } from 'express';
import type { ProjectLifecycleService } from '../../../services/project-lifecycle-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createResearchHandler(lifecycleService: ProjectLifecycleService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug } = req.body as {
        projectPath: string;
        projectSlug: string;
      };

      if (!projectPath || !projectSlug) {
        res.status(400).json({ success: false, error: 'projectPath and projectSlug are required' });
        return;
      }

      const result = await lifecycleService.research(projectPath, projectSlug);
      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'Research trigger failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
