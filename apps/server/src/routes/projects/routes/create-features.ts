/**
 * POST /create-features endpoint - Create features from a project plan
 *
 * Converts project phases into features on the Kanban board:
 * - Each phase becomes a feature
 * - Each milestone can optionally become an epic
 * - Dependencies are translated to feature dependencies
 */

import type { Request, Response } from 'express';
import { projectPlanExists } from '@protolabsai/platform';
import { FeatureLoader } from '../../../services/feature-loader.js';
import { orchestrateProjectFeatures } from '../../../services/project-orchestration-service.js';
import type { ProjectService } from '../../../services/project-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import { getErrorMessage, logError } from '../common.js';

interface CreateFeaturesRequest {
  projectPath: string;
  projectSlug: string;
  createEpics?: boolean;
  setupDependencies?: boolean;
  initialStatus?: 'backlog' | 'in-progress';
}

export function createCreateFeaturesHandler(
  featureLoader: FeatureLoader,
  events: EventEmitter,
  projectService: ProjectService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        projectSlug,
        createEpics = true,
        setupDependencies = true,
        initialStatus = 'backlog',
      } = req.body as CreateFeaturesRequest;

      // Validate required fields
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

      // Load project
      const project = await projectService.getProject(projectPath, projectSlug);
      if (!project) {
        res.status(500).json({ success: false, error: 'Failed to load project.json' });
        return;
      }

      if (!project.milestones || project.milestones.length === 0) {
        res.status(400).json({ success: false, error: 'Project has no milestones' });
        return;
      }

      // Orchestrate feature creation via service
      const result = await orchestrateProjectFeatures(
        project,
        {
          projectPath,
          projectSlug,
          createEpics,
          setupDependencies,
          initialStatus,
        },
        featureLoader,
        events
      );

      res.json({ success: true, result });
    } catch (error) {
      logError(error, 'Create features from project failed');
      events.emit('project:features:error', { error: getErrorMessage(error) });
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
