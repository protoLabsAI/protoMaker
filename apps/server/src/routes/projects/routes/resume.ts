/**
 * POST /resume endpoint - Resume an app/projectPath (app-level resume).
 *
 * Removes the app from the durable `pausedProjects` registry and restores each
 * paused project slug's prior status. Does NOT restart auto-mode.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import type { ProjectPauseService } from '../../../services/project-pause-service.js';

export function createResumeHandler(pauseService: ProjectPauseService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body ?? {};
      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const result = await pauseService.resumeProject(projectPath);

      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'Resume project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
