/**
 * POST /lifecycle/request-changes - Request changes to a PRD
 *
 * Sets the project status back to 'reviewing' and stores the feedback
 * so that the next PRD regeneration can incorporate it.
 */

import type { Request, Response } from 'express';
import type { ProjectService } from '../../../services/project-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import { getErrorMessage, logError } from '../common.js';

export function createRequestChangesHandler(projectService: ProjectService, events?: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, feedback } = req.body as {
        projectPath: string;
        projectSlug: string;
        feedback: string;
      };

      if (!projectPath || !projectSlug) {
        res.status(400).json({ success: false, error: 'projectPath and projectSlug are required' });
        return;
      }

      if (!feedback?.trim()) {
        res.status(400).json({ success: false, error: 'feedback is required' });
        return;
      }

      const project = await projectService.getProject(projectPath, projectSlug);
      if (!project) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      // Update project with feedback and reset status to reviewing
      const updated = await projectService.updateProject(projectPath, projectSlug, {
        status: 'reviewing',
        reviewFeedback: feedback.trim(),
      });

      if (events) {
        events.emit('project:prd:changes-requested', {
          projectSlug,
          projectPath,
          feedback: feedback.trim(),
        });
      }

      res.json({
        success: true,
        project: updated,
        message: 'Changes requested — feedback stored for PRD regeneration',
      });
    } catch (error) {
      logError(error, 'Request changes failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
