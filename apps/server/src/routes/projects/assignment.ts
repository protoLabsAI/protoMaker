/**
 * Project Assignment routes — HTTP API for project-to-instance assignment
 *
 * Provides endpoints for:
 * - Assigning a project to an instance
 * - Unassigning a project
 * - Listing all project assignments
 * - Reassigning orphaned projects
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ProjectAssignmentService } from '../../services/project-assignment-service.js';
import { getErrorMessage, logError } from './common.js';

export function createAssignmentRoutes(projectAssignmentService: ProjectAssignmentService): Router {
  const router = Router();

  // POST /assign — assign a project to an instance
  router.post('/assign', async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, assignedTo, assignedBy } = req.body as {
        projectPath: string;
        projectSlug: string;
        assignedTo: string;
        assignedBy: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!projectSlug) {
        res.status(400).json({ success: false, error: 'projectSlug is required' });
        return;
      }
      if (!assignedTo) {
        res.status(400).json({ success: false, error: 'assignedTo is required' });
        return;
      }
      if (!assignedBy) {
        res.status(400).json({ success: false, error: 'assignedBy is required' });
        return;
      }

      const project = await projectAssignmentService.assignProject(
        projectPath,
        projectSlug,
        assignedTo,
        assignedBy
      );

      if (!project) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      res.json({ success: true, project });
    } catch (error) {
      logError(error, 'Assign project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /unassign — clear assignment fields on a project
  router.post('/unassign', async (req: Request, res: Response): Promise<void> => {
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

      const project = await projectAssignmentService.unassignProject(projectPath, projectSlug);

      if (!project) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      res.json({ success: true, project });
    } catch (error) {
      logError(error, 'Unassign project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /list-assignments — list all project assignments
  router.post('/list-assignments', async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const assignments = await projectAssignmentService.getAssignments(projectPath);
      res.json({ success: true, assignments });
    } catch (error) {
      logError(error, 'List project assignments failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // POST /reassign-orphaned — detect and reassign orphaned projects
  router.post('/reassign-orphaned', async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const reassigned = await projectAssignmentService.reassignOrphanedProjects(projectPath);
      res.json({ success: true, reassigned });
    } catch (error) {
      logError(error, 'Reassign orphaned projects failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  return router;
}
