/**
 * POST /archive endpoint - Archive a project
 *
 * Slims down project.json to mapping data only and removes
 * .md files and milestones/ directory.
 */

import type { Request, Response } from 'express';
import { projectPlanExists } from '@protolabsai/platform';
import type { ProjectService } from '../../../services/project-service.js';
import { getErrorMessage, logError } from '../common.js';

interface ArchiveRequest {
  projectPath: string;
  projectSlug: string;
}

export function createArchiveHandler(projectService: ProjectService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug } = req.body as ArchiveRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!projectSlug) {
        res.status(400).json({ success: false, error: 'projectSlug is required' });
        return;
      }

      // Check if project exists
      const exists = await projectPlanExists(projectPath, projectSlug);
      if (!exists) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      const result = await projectService.archiveProject(projectPath, projectSlug);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logError(error, 'Archive project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
