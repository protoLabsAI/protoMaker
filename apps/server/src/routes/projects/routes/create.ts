/**
 * POST /create endpoint - Create a new project plan
 */

import { z } from 'zod';
import type { Request, Response } from 'express';
import type { Project, Milestone, Phase } from '@protolabsai/types';
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
} from '@protolabsai/platform';
import { secureFs } from '@protolabsai/platform';
import {
  generateProjectFile,
  generateMilestoneFile,
  generatePhaseFile,
  generatePrdFile,
} from '@protolabsai/utils';
import { getErrorMessage, logError } from '../common.js';
import type { ProjectService } from '../../../services/project-service.js';
import { projectPathSchema } from '../../../lib/validation.js';

const sparcPrdSchema = z.object({
  situation: z.string(),
  problem: z.string(),
  approach: z.string(),
  results: z.string(),
  constraints: z.string(),
  generatedAt: z.string(),
  approvedAt: z.string().optional(),
});

const phaseInputSchema = z.object({
  title: z.string().min(1, 'phase title must not be empty'),
  description: z.string(),
  filesToModify: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  complexity: z.enum(['small', 'medium', 'large']).optional(),
  dependencies: z.array(z.string()).optional(),
});

const milestoneInputSchema = z.object({
  title: z.string().min(1, 'milestone title must not be empty'),
  description: z.string(),
  dependencies: z.array(z.string()).optional(),
  phases: z.array(phaseInputSchema),
});

const createProjectBodySchema = z.object({
  projectPath: projectPathSchema,
  title: z.string().min(1, 'title must not be empty'),
  goal: z.string().min(1, 'goal must not be empty'),
  slug: z.string().optional(),
  color: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
  prd: sparcPrdSchema.optional(),
  researchSummary: z.string().optional(),
  milestones: z.array(milestoneInputSchema).optional(),
});

export function createCreateHandler(projectService: ProjectService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = createProjectBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: parsed.error.issues,
        });
        return;
      }
      const {
        projectPath,
        title,
        goal,
        slug,
        color,
        priority,
        prd,
        researchSummary,
        milestones: milestoneInputs,
      } = parsed.data;

      // Generate slug from title if not provided
      const projectSlug = slug || generateProjectSlug(title);

      // Check if project already exists — allow overwriting stubs from initiate_project
      const exists = await projectPlanExists(projectPath, projectSlug);
      if (exists) {
        const jsonPath = getProjectJsonPath(projectPath, projectSlug);
        try {
          const raw = await secureFs.readFile(jsonPath, 'utf-8');
          const existing = JSON.parse(String(raw)) as Project;
          const isStub = !existing.milestones || existing.milestones.length === 0;
          if (!isStub) {
            res
              .status(409)
              .json({ success: false, error: `Project "${projectSlug}" already exists` });
            return;
          }
          // Stub from initiate_project — overwrite it
        } catch {
          res
            .status(409)
            .json({ success: false, error: `Project "${projectSlug}" already exists` });
          return;
        }
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
        ...(color ? { color } : {}),
        ...(priority ? { priority } : {}),
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

      // Sync the new project into the CRDT doc so getProject() returns it
      // immediately without requiring a server restart
      await projectService.syncProjectToCrdt(projectPath, project, 'project:created');

      res.json({ success: true, project });
    } catch (error) {
      logError(error, 'Create project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
