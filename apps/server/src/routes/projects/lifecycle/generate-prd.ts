/**
 * POST /lifecycle/generate-prd - Generate SPARC PRD from idea
 *
 * This is a placeholder that returns the existing PRD if available.
 * Full LLM-based PRD generation + antagonistic review is handled by the
 * /plan-project skill which orchestrates multiple MCP tools.
 */

import type { Request, Response } from 'express';
import type { ProjectService } from '../../../services/project-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createGeneratePrdHandler(projectService: ProjectService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug } = req.body as {
        projectPath: string;
        projectSlug: string;
        additionalContext?: string;
      };

      if (!projectPath || !projectSlug) {
        res.status(400).json({ success: false, error: 'projectPath and projectSlug are required' });
        return;
      }

      const project = await projectService.getProject(projectPath, projectSlug);
      if (!project) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      if (project.prd) {
        res.json({
          success: true,
          prd: project.prd,
          reviewVerdict: 'approve',
          reviewSummary: 'PRD already exists',
          priorityScore: 3,
          suggestedTiming: 'now',
        });
        return;
      }

      // Without a PRD, suggest using the skill to generate one
      res.json({
        success: true,
        prd: null,
        reviewVerdict: 'revise',
        reviewSummary: 'No PRD found. Use create_project with a PRD, or the /plan-project skill.',
        priorityScore: 0,
        suggestedTiming: 'now',
      });
    } catch (error) {
      logError(error, 'Generate PRD failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
