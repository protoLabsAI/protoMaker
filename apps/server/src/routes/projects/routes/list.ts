/**
 * POST /list endpoint - List all project plans for a project
 */

import type { Request, Response } from 'express';
import { listProjectPlans } from '@protolabs-ai/platform';
import { getErrorMessage, logError } from '../common.js';

export function createListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const projectSlugs = await listProjectPlans(projectPath);
      res.json({ success: true, projects: projectSlugs });
    } catch (error) {
      logError(error, 'List project plans failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
