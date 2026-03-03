/**
 * POST /delete endpoint - Delete a project plan (with stats capture)
 */

import type { Request, Response } from 'express';
import type { ProjectService } from '../../../services/project-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createDeleteHandler(projectService: ProjectService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug } = req.body as {
        projectPath: string;
        projectSlug: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!projectSlug) {
        res.status(400).json({ success: false, error: 'projectSlug is required' });
        return;
      }

      const deleted = await projectService.deleteProject(projectPath, projectSlug);
      if (!deleted) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
