/**
 * POST /update endpoint - Update a project plan
 */

import type { Request, Response } from 'express';
import type { UpdateProjectInput } from '@protolabsai/types';
import { getPrdFilePath, getResearchFilePath } from '@protolabsai/platform';
import { secureFs } from '@protolabsai/platform';
import { generatePrdFile } from '@protolabsai/utils';
import { getErrorMessage, logError } from '../common.js';
import type { ProjectService } from '../../../services/project-service.js';

interface UpdateProjectRequest {
  projectPath: string;
  projectSlug: string;
  updates: UpdateProjectInput;
}

export function createUpdateHandler(projectService: ProjectService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, updates } = req.body as UpdateProjectRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!projectSlug) {
        res.status(400).json({ success: false, error: 'projectSlug is required' });
        return;
      }
      if (!updates) {
        res.status(400).json({ success: false, error: 'updates is required' });
        return;
      }

      // Use ProjectService to apply the update — reads from CRDT-aware getProject(),
      // writes project.json + project.md, and syncs the CRDT doc in one call.
      let project;
      try {
        project = await projectService.updateProject(projectPath, projectSlug, updates);
      } catch (error) {
        logError(error, 'Update project failed');
        res.status(500).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      if (!project) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      // Write prd.md if PRD field is present and has a value.
      // Note: We check for presence and truthy value since PRD is a complex object.
      if ('prd' in updates && updates.prd) {
        const prdFilePath = getPrdFilePath(projectPath, projectSlug);
        const prdContent = generatePrdFile(project.title, updates.prd);
        await secureFs.writeFile(prdFilePath, prdContent, 'utf-8');
      }

      // Write research.md if research summary field is present (use 'in' to detect explicit clearing).
      if ('researchSummary' in updates) {
        const researchFilePath = getResearchFilePath(projectPath, projectSlug);
        await secureFs.writeFile(researchFilePath, updates.researchSummary ?? '', 'utf-8');
      }

      res.json({ success: true, project });
    } catch (error) {
      logError(error, 'Update project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
