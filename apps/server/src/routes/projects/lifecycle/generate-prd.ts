/**
 * POST /lifecycle/generate-prd - Generate SPARC PRD from project context using AI
 */

import type { Request, Response } from 'express';
import type { ProjectLifecycleService } from '../../../services/project-lifecycle-service.js';
import type { ProjectService } from '../../../services/project-service.js';
import { resolveModelString } from '@protolabsai/model-resolver';
import { streamingQuery } from '../../../providers/simple-query-service.js';
import { getErrorMessage, logError } from '../common.js';

const PRD_MODEL = resolveModelString('sonnet');

const SPARC_SYSTEM_PROMPT = `You are a senior product manager generating a SPARC PRD (Product Requirements Document).

You MUST respond with ONLY a valid JSON object — no markdown, no code fences, no preamble. The JSON object must have exactly these 5 string fields:

{
  "situation": "Current state and context...",
  "problem": "The core problem to solve...",
  "approach": "How we'll solve it...",
  "results": "Expected outcomes and success criteria...",
  "constraints": "Technical/business constraints and non-goals..."
}

Each section should be 2-4 paragraphs of rich, actionable content in Markdown format (within the JSON string values). Be specific, not generic. Reference the project's actual goals and context.`;

export function createGeneratePrdHandler(
  lifecycleService: ProjectLifecycleService,
  projectService: ProjectService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, additionalContext } = req.body as {
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

      // Build context from project data
      const contextParts = [
        `**Project:** ${project.title}`,
        project.goal ? `**Goal:** ${project.goal}` : '',
        project.description ? `**Description:** ${project.description}` : '',
        project.researchSummary ? `**Research Summary:**\n${project.researchSummary}` : '',
        additionalContext ? `**Additional Context:**\n${additionalContext}` : '',
      ].filter(Boolean);

      const prompt = `Generate a SPARC PRD for this project. Respond with ONLY a JSON object.\n\n${contextParts.join('\n\n')}`;

      // Update status to drafting
      await projectService.updateProject(projectPath, projectSlug, { status: 'drafting' });

      const result = await streamingQuery({
        prompt,
        systemPrompt: SPARC_SYSTEM_PROMPT,
        model: PRD_MODEL,
        cwd: projectPath,
        maxTurns: 1,
        traceContext: { projectSlug, phase: 'prd', agentRole: 'prd-generator' },
      });

      const text = result.text || '';

      // Parse JSON from the response — handle potential markdown code fences
      let prd: {
        situation: string;
        problem: string;
        approach: string;
        results: string;
        constraints: string;
      };
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in response');
        prd = JSON.parse(jsonMatch[0]);
      } catch {
        res.status(500).json({
          success: false,
          error: 'Failed to parse PRD from AI response',
          rawText: text.slice(0, 2000),
        });
        return;
      }

      // Save PRD to project
      await projectService.updateProject(projectPath, projectSlug, {
        prd: {
          situation: prd.situation || '',
          problem: prd.problem || '',
          approach: prd.approach || '',
          results: prd.results || '',
          constraints: prd.constraints || '',
          generatedAt: new Date().toISOString(),
        },
        status: 'reviewing',
      });

      res.json({ success: true, prd });
    } catch (error) {
      logError(error, 'Generate PRD failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
