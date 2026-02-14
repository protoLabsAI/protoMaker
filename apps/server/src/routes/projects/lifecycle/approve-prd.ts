/**
 * POST /lifecycle/approve-prd - Approve PRD and create features from milestones
 */

import type { Request, Response } from 'express';
import type { ProjectLifecycleService } from '../../../services/project-lifecycle-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createApprovePrdHandler(lifecycleService: ProjectLifecycleService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, createEpics, setupDependencies } = req.body as {
        projectPath: string;
        projectSlug: string;
        createEpics?: boolean;
        setupDependencies?: boolean;
      };

      if (!projectPath || !projectSlug) {
        res.status(400).json({ success: false, error: 'projectPath and projectSlug are required' });
        return;
      }

      const result = await lifecycleService.approvePrd(projectPath, projectSlug, {
        createEpics,
        setupDependencies,
      });

      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'Approve PRD failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
