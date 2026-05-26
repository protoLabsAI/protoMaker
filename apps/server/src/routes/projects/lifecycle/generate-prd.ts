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

      // A regeneration after "request changes" carries reviewer feedback and a
      // prior PRD. Feed both to the model so it REVISES the existing PRD to
      // address the feedback instead of starting from scratch (the whole point
      // of the request-changes loop).
      const reviewFeedback = project.reviewFeedback?.trim();
      const priorPrd = project.prd;
      const PRD_SECTIONS = ['situation', 'problem', 'approach', 'results', 'constraints'] as const;

      // Build context from project data
      const contextParts = [
        `**Project:** ${project.title}`,
        project.goal ? `**Goal:** ${project.goal}` : '',
        project.description ? `**Description:** ${project.description}` : '',
        project.researchSummary ? `**Research Summary:**\n${project.researchSummary}` : '',
        priorPrd
          ? `**Existing PRD (revise this — do not discard what still holds):**\n${PRD_SECTIONS.map(
              (k) => `### ${k}\n${priorPrd[k] || ''}`
            ).join('\n\n')}`
          : '',
        reviewFeedback ? `**Requested changes to address:**\n${reviewFeedback}` : '',
        additionalContext ? `**Additional Context:**\n${additionalContext}` : '',
      ].filter(Boolean);

      const instruction = reviewFeedback
        ? 'Revise the SPARC PRD below to address the requested changes, preserving sections that are still correct.'
        : 'Generate a SPARC PRD for this project.';
      const prompt = `${instruction} Respond with ONLY a JSON object.\n\n${contextParts.join('\n\n')}`;

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

      // Save PRD to project. Clear reviewFeedback now that it's been folded into
      // this revision, so it isn't re-applied to a future unrelated regeneration.
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
        ...(reviewFeedback ? { reviewFeedback: '' } : {}),
      });

      res.json({ success: true, prd });
    } catch (error) {
      logError(error, 'Generate PRD failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
