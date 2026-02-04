/**
 * POST /get endpoint - Get a project plan with all its milestones and phases
 */

import type { Request, Response } from 'express';
import type { Project, Milestone, Phase } from '@automaker/types';
import {
  getProjectJsonPath,
  getProjectFilePath,
  getMilestonesDir,
  getMilestoneFilePath,
  getMilestoneDir,
  listMilestones,
  listPhases,
  projectPlanExists,
} from '@automaker/platform';
import { secureFs } from '@automaker/platform';
import { parseProjectFile, parseMilestoneFile, parsePhaseFile } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

export function createGetHandler() {
  return async (req: Request, res: Response): Promise<void> => {
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
