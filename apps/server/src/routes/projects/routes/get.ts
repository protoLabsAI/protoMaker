/**
 * POST /get endpoint - Get a project plan with all its milestones and phases
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { Project, Milestone, Phase } from '@protolabsai/types';
import {
  getProjectJsonPath,
  getProjectFilePath,
  getMilestoneFilePath,
  getMilestoneDir,
  listMilestones,
  listPhases,
  projectPlanExists,
} from '@protolabsai/platform';
import { secureFs } from '@protolabsai/platform';
import { parseProjectFile, parseMilestoneFile, parsePhaseFile } from '@protolabsai/utils';
import { getErrorMessage, logError } from '../common.js';
import { projectPathSchema } from '../../../lib/validation.js';

const getProjectBodySchema = z.object({
  projectPath: projectPathSchema,
  projectSlug: z.string().min(1, 'projectSlug must not be empty'),
});

export function createGetHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = getProjectBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
        return;
      }
      const { projectPath, projectSlug } = parsed.data;

      // Check if project exists
      const exists = await projectPlanExists(projectPath, projectSlug);
      if (!exists) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      // Try to load from JSON first (more complete data)
      const jsonPath = getProjectJsonPath(projectPath, projectSlug);
      try {
        const jsonContent = (await secureFs.readFile(jsonPath, 'utf-8')) as string;
        const project = JSON.parse(jsonContent) as Project;
        res.json({ success: true, project });
        return;
      } catch {
        // Fall back to parsing markdown files
      }

      // Parse project.md
      const projectFilePath = getProjectFilePath(projectPath, projectSlug);
      let projectData: Partial<Project>;
      try {
        const projectContent = (await secureFs.readFile(projectFilePath, 'utf-8')) as string;
        projectData = parseProjectFile(projectContent, projectSlug);
      } catch {
        // Use defaults if project.md doesn't exist
        projectData = {
          slug: projectSlug,
          title: projectSlug,
          goal: '',
          status: 'drafting',
          milestones: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      // Load milestones
      const milestoneSlugs = await listMilestones(projectPath, projectSlug);
      const milestones: Milestone[] = [];

      for (const milestoneSlug of milestoneSlugs) {
        const milestoneFilePath = getMilestoneFilePath(projectPath, projectSlug, milestoneSlug);
        let milestoneData: Partial<Milestone>;

        try {
          const milestoneContent = (await secureFs.readFile(milestoneFilePath, 'utf-8')) as string;
          milestoneData = parseMilestoneFile(milestoneContent, milestoneSlug);
        } catch {
          // Use defaults if milestone.md doesn't exist
          milestoneData = {
            number: milestones.length + 1,
            slug: milestoneSlug,
            title: milestoneSlug,
            description: '',
            phases: [],
            status: 'pending',
          };
        }

        // Load phases for this milestone
        const phaseFiles = await listPhases(projectPath, projectSlug, milestoneSlug);
        const phases: Phase[] = [];

        for (const phaseFile of phaseFiles) {
          const milestoneDir = getMilestoneDir(projectPath, projectSlug, milestoneSlug);
          const phaseFilePath = `${milestoneDir}/${phaseFile}`;

          try {
            const phaseContent = (await secureFs.readFile(phaseFilePath, 'utf-8')) as string;
            const phase = parsePhaseFile(phaseContent, phaseFile);
            phases.push(phase);
          } catch {
            // Skip phases that can't be parsed
          }
        }

        milestones.push({
          ...milestoneData,
          phases,
        } as Milestone);
      }

      const project: Project = {
        ...(projectData as Project),
        milestones,
      };

      res.json({ success: true, project });
    } catch (error) {
      logError(error, 'Get project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
