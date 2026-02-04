/**
 * POST /delete endpoint - Delete a project plan
 */

import type { Request, Response } from 'express';
import { deleteProjectPlan, projectPlanExists } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';

export function createDeleteHandler() {
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

      // Check if project exists
      const exists = await projectPlanExists(projectPath, projectSlug);
      if (!exists) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      const deleted = await deleteProjectPlan(projectPath, projectSlug);
      if (!deleted) {
        res.status(500).json({ success: false, error: 'Failed to delete project' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
