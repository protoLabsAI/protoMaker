/**
 * POST /create endpoint - Create a new project plan
 */

import type { Request, Response } from 'express';
import type { Project, Milestone, Phase, SPARCPrd } from '@automaker/types';
import {
  ensureProjectStructure,
  ensureMilestoneDir,
  getProjectJsonPath,
  getProjectFilePath,
  getPrdFilePath,
  getResearchFilePath,
  getMilestoneFilePath,
  getPhaseFilePath,
  generateMilestoneSlug,
  generatePhaseSlug,
  generateProjectSlug,
  projectPlanExists,
} from '@automaker/platform';
import { secureFs } from '@automaker/platform';
import {
  generateProjectFile,
  generateMilestoneFile,
  generatePhaseFile,
  generatePrdFile,
} from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

interface CreateProjectRequest {
  projectPath: string;
  title: string;
  goal: string;
  slug?: string;
  prd?: SPARCPrd;
  researchSummary?: string;
  milestones?: Array<{
    title: string;
    description: string;
    dependencies?: string[];
    phases: Array<{
      title: string;
      description: string;
      filesToModify?: string[];
      acceptanceCriteria?: string[];
      complexity?: 'small' | 'medium' | 'large';
      dependencies?: string[];
    }>;
  }>;
}

export function createCreateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        title,
        goal,
        slug,
        prd,
        researchSummary,
        milestones: milestoneInputs,
      } = req.body as CreateProjectRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!title) {
        res.status(400).json({ success: false, error: 'title is required' });
        return;
      }
      if (!goal) {
        res.status(400).json({ success: false, error: 'goal is required' });
        return;
      }

      // Generate slug from title if not provided
      const projectSlug = slug || generateProjectSlug(title);

      // Check if project already exists
      const exists = await projectPlanExists(projectPath, projectSlug);
      if (exists) {
        res.status(409).json({ success: false, error: `Project "${projectSlug}" already exists` });
        return;
      }

      // Create directory structure
      await ensureProjectStructure(projectPath, projectSlug);

      // Build milestones
      const milestones: Milestone[] = [];
      if (milestoneInputs && milestoneInputs.length > 0) {
        for (let i = 0; i < milestoneInputs.length; i++) {
          const input = milestoneInputs[i];
          const milestoneNumber = i + 1;
          const milestoneSlug = generateMilestoneSlug(milestoneNumber, input.title);

          // Create milestone directory
          await ensureMilestoneDir(projectPath, projectSlug, milestoneSlug);

          // Build phases
          const phases: Phase[] = [];
          if (input.phases && input.phases.length > 0) {
            for (let j = 0; j < input.phases.length; j++) {
              const phaseInput = input.phases[j];
              const phaseNumber = j + 1;
              const phaseName = generatePhaseSlug(phaseInput.title);

              const phase: Phase = {
                number: phaseNumber,
                name: phaseName,
                title: phaseInput.title,
                description: phaseInput.description,
                filesToModify: phaseInput.filesToModify,
                acceptanceCriteria: phaseInput.acceptanceCriteria,
                complexity: phaseInput.complexity || 'medium',
                dependencies: phaseInput.dependencies,
              };
              phases.push(phase);

              // Write phase file
              const phaseFilePath = getPhaseFilePath(
                projectPath,
                projectSlug,
                milestoneSlug,
                phaseNumber,
                phaseName
              );
              const phaseContent = generatePhaseFile(phase);
              await secureFs.writeFile(phaseFilePath, phaseContent, 'utf-8');
            }
          }

          const milestone: Milestone = {
            number: milestoneNumber,
            slug: milestoneSlug,
            title: input.title,
            description: input.description,
            phases,
            dependencies: input.dependencies,
            status: 'pending',
          };
          milestones.push(milestone);

          // Write milestone.md
          const milestoneFilePath = getMilestoneFilePath(projectPath, projectSlug, milestoneSlug);
          const milestoneContent = generateMilestoneFile(milestone);
          await secureFs.writeFile(milestoneFilePath, milestoneContent, 'utf-8');
        }
      }

      // Create project object
      const now = new Date().toISOString();
      const project: Project = {
        slug: projectSlug,
        title,
        goal,
        status: prd ? 'approved' : 'drafting',
        milestones,
        researchSummary,
        prd,
        createdAt: now,
        updatedAt: now,
      };

      // Write project.json (full data)
      const jsonPath = getProjectJsonPath(projectPath, projectSlug);
      await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2), 'utf-8');

      // Write project.md (human-readable)
      const projectFilePath = getProjectFilePath(projectPath, projectSlug);
      const projectContent = generateProjectFile(project);
      await secureFs.writeFile(projectFilePath, projectContent, 'utf-8');

      // Write prd.md if PRD provided
      if (prd) {
        const prdFilePath = getPrdFilePath(projectPath, projectSlug);
        const prdContent = generatePrdFile(title, prd);
        await secureFs.writeFile(prdFilePath, prdContent, 'utf-8');
      }

      // Write research.md if research summary provided
      if (researchSummary) {
        const researchFilePath = getResearchFilePath(projectPath, projectSlug);
        await secureFs.writeFile(researchFilePath, researchSummary, 'utf-8');
      }

      res.json({ success: true, project });
    } catch (error) {
      logError(error, 'Create project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
