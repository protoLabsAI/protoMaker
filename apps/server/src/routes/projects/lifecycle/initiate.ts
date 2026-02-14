/**
 * POST /lifecycle/initiate - Dedup check + create Linear project + write idea doc
 */

import type { Request, Response } from 'express';
import type { ProjectLifecycleService } from '../../../services/project-lifecycle-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createInitiateHandler(lifecycleService: ProjectLifecycleService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, title, ideaDescription } = req.body as {
        projectPath: string;
        title: string;
        ideaDescription: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!title) {
        res.status(400).json({ success: false, error: 'title is required' });
        return;
      }
      if (!ideaDescription) {
        res.status(400).json({ success: false, error: 'ideaDescription is required' });
        return;
      }

      const result = await lifecycleService.initiate(projectPath, title, ideaDescription);
      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'Lifecycle initiate failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
