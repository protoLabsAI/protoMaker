/**
 * POST /pause endpoint - Pause an app/projectPath (app-level pause).
 *
 * Records the app in the durable `pausedProjects` registry, reflects
 * `status: 'paused'` on every non-terminal project slug, and stops any running
 * auto-mode loop for the projectPath.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import type { ProjectPauseService } from '../../../services/project-pause-service.js';

export function createPauseHandler(pauseService: ProjectPauseService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, reason } = req.body ?? {};
      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const result = await pauseService.pauseProject(
        projectPath,
        typeof reason === 'string' ? reason : undefined
      );

      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'Pause project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
