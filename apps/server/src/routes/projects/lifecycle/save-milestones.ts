/**
 * POST /lifecycle/save-milestones - Save structured milestone data to a project
 *
 * This is the missing seam between PM agent PRD output and approve_project.
 * After the PM agent generates a PRD, call this to persist structured milestones
 * so that approve_project_prd can find them.
 */

import type { Request, Response } from 'express';
import type { ProjectLifecycleService } from '../../../services/project-lifecycle-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createSaveMilestonesHandler(lifecycleService: ProjectLifecycleService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, milestones } = req.body as {
        projectPath: string;
        projectSlug: string;
        milestones: unknown[];
      };

      if (!projectPath || !projectSlug) {
        res.status(400).json({ success: false, error: 'projectPath and projectSlug are required' });
        return;
      }

      if (!Array.isArray(milestones) || milestones.length === 0) {
        res.status(400).json({ success: false, error: 'milestones must be a non-empty array' });
        return;
      }

      const project = await lifecycleService.saveMilestones(
        projectPath,
        projectSlug,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        milestones as any
      );

      res.json({
        success: true,
        projectSlug: project.slug,
        milestonesCount: project.milestones.length,
        status: project.status,
      });
    } catch (error) {
      logError(error, 'Save milestones failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
