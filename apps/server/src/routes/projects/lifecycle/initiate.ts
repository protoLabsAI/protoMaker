/**
 * POST /lifecycle/initiate - Create local project entry
 */

import type { Request, Response } from 'express';
import type { ProjectLifecycleService } from '../../../services/project-lifecycle-service.js';
import type { ProjectService } from '../../../services/project-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createInitiateHandler(
  lifecycleService: ProjectLifecycleService,
  projectService: ProjectService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        title,
        ideaDescription,
        color,
        priority,
        description,
        researchOnCreate,
      } = req.body as {
        projectPath: string;
        title: string;
        ideaDescription: string;
        color?: string;
        priority?: string;
        description?: string;
        researchOnCreate?: boolean;
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

      const result = await lifecycleService.initiate(projectPath, title, ideaDescription, {
        researchOnCreate,
      });

      // Persist color, priority, and description if provided
      if (result.localSlug && (color || priority || description)) {
        const updates: Record<string, unknown> = {};
        if (color) updates.color = color;
        if (priority) updates.priority = priority;
        if (description) updates.description = description;
        await projectService.updateProject(projectPath, result.localSlug, updates);
      }

      res.json({ success: true, ...result });
    } catch (error) {
      logError(error, 'Lifecycle initiate failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
