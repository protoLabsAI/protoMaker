/**
 * POST /update endpoint - Update a project plan
 */

import type { Request, Response } from 'express';
import type { Project, UpdateProjectInput } from '@protolabsai/types';
import {
  getProjectJsonPath,
  getProjectFilePath,
  getPrdFilePath,
  getResearchFilePath,
  projectPlanExists,
} from '@protolabsai/platform';
import { secureFs } from '@protolabsai/platform';
import { generateProjectFile, generatePrdFile } from '@protolabsai/utils';
import { getErrorMessage, logError } from '../common.js';

interface UpdateProjectRequest {
  projectPath: string;
  projectSlug: string;
  updates: UpdateProjectInput;
}

export function createUpdateHandler() {
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

      // Check if project exists
      const exists = await projectPlanExists(projectPath, projectSlug);
      if (!exists) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      // Load existing project
      const jsonPath = getProjectJsonPath(projectPath, projectSlug);
      let project: Project;
      try {
        const jsonContent = (await secureFs.readFile(jsonPath, 'utf-8')) as string;
        project = JSON.parse(jsonContent) as Project;
      } catch {
        res.status(500).json({ success: false, error: 'Failed to load project.json' });
        return;
      }

      // Apply all updates via spread — UpdateProjectInput defines the allowed fields
      const { prd: _prd, researchSummary: _rs, ...safeUpdates } = updates;
      Object.assign(project, safeUpdates);
      if (updates.prd !== undefined) {
        project.prd = updates.prd;
      }
      if (updates.researchSummary !== undefined) {
        project.researchSummary = updates.researchSummary;
      }

      project.updatedAt = new Date().toISOString();

      // Save updated project.json
      await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2), 'utf-8');

      // Update project.md
      const projectFilePath = getProjectFilePath(projectPath, projectSlug);
      const projectContent = generateProjectFile(project);
      await secureFs.writeFile(projectFilePath, projectContent, 'utf-8');

      // Update prd.md if PRD field is present and has a value
      // Note: We check for presence and truthy value since PRD is a complex object
      if ('prd' in updates && updates.prd) {
        const prdFilePath = getPrdFilePath(projectPath, projectSlug);
        const prdContent = generatePrdFile(project.title, updates.prd);
        await secureFs.writeFile(prdFilePath, prdContent, 'utf-8');
      }

      // Update research.md if research summary field is present (use 'in' to detect explicit clearing)
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
