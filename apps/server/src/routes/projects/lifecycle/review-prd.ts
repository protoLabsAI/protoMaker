/**
 * POST /lifecycle/review-prd - Agent-driven quality review of a project's PRD.
 *
 * Closes the "no real review gate" gap: previously `reviewing -> approved` was a
 * bare UI button with no agent evaluation. This runs a critic agent over the
 * SPARC PRD and produces a structured verdict.
 *
 * Synergy with the rest of the flow:
 *   - PASS  -> status 'approved' (the reserved state from the lifecycle model),
 *              reviewFeedback cleared. The project is ready to scaffold.
 *   - FAIL  -> status stays 'reviewing', the actionable issues are stored as
 *              reviewFeedback so the next generate-prd revision addresses them.
 *
 * This is an available gate, not a hard block on approve-prd — the UI / operator
 * decides whether to require a passing review before scaffolding.
 */

import type { Request, Response } from 'express';
import type { ProjectService } from '../../../services/project-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import { resolveModelString } from '@protolabsai/model-resolver';
import { streamingQuery } from '../../../providers/simple-query-service.js';
import { getErrorMessage, logError } from '../common.js';

const REVIEW_MODEL = resolveModelString('sonnet');

/** Score at/above which a PRD passes review when the model doesn't say otherwise. */
const PASS_THRESHOLD = 75;

const REVIEW_SYSTEM_PROMPT = `You are a senior staff engineer doing a critical review of a SPARC PRD before any engineering work begins. Be rigorous and skeptical — your job is to catch weak plans early, not to rubber-stamp.

Evaluate the PRD against these criteria:
- Situation: grounded in real context, not generic boilerplate
- Problem: a sharp, specific problem statement (not a solution in disguise)
- Approach: concrete and feasible; names real components/steps, not hand-waving
- Results: measurable, verifiable success criteria
- Constraints: explicit constraints AND non-goals (scope boundaries)

You MUST respond with ONLY a valid JSON object — no markdown, no code fences, no preamble:

{
  "passed": true,
  "score": 0,
  "issues": ["each issue is a specific, actionable fix the author should make"],
  "summary": "one-paragraph verdict"
}

Rules:
- "score" is 0-100 (overall PRD quality).
- "passed" is true only if the PRD is genuinely ready for implementation. A score below ${PASS_THRESHOLD}, or any critical gap (missing measurable results, infeasible approach, no non-goals), means passed=false.
- "issues" must be empty when passed=true, and non-empty and actionable when passed=false.`;

export function createReviewPrdHandler(projectService: ProjectService, events?: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug } = req.body as {
        projectPath: string;
        projectSlug: string;
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

      if (!project.prd) {
        res
          .status(400)
          .json({ success: false, error: 'Project has no PRD. Generate one before reviewing.' });
        return;
      }

      const prd = project.prd;
      const prompt = `Review this SPARC PRD. Respond with ONLY a JSON object.

**Project:** ${project.title}
${project.goal ? `**Goal:** ${project.goal}` : ''}

### situation
${prd.situation || ''}

### problem
${prd.problem || ''}

### approach
${prd.approach || ''}

### results
${prd.results || ''}

### constraints
${prd.constraints || ''}`;

      const result = await streamingQuery({
        prompt,
        systemPrompt: REVIEW_SYSTEM_PROMPT,
        model: REVIEW_MODEL,
        cwd: projectPath,
        maxTurns: 1,
        traceContext: { projectSlug, phase: 'prd-review', agentRole: 'prd-reviewer' },
      });

      const text = result.text || '';
      let review: { passed: boolean; score: number; issues: string[]; summary: string };
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in response');
        const parsed = JSON.parse(jsonMatch[0]) as Partial<typeof review>;
        review = {
          passed: Boolean(parsed.passed),
          score: typeof parsed.score === 'number' ? parsed.score : 0,
          issues: Array.isArray(parsed.issues)
            ? parsed.issues.filter((i) => typeof i === 'string')
            : [],
          summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        };
      } catch {
        res.status(500).json({
          success: false,
          error: 'Failed to parse PRD review from AI response',
          rawText: text.slice(0, 2000),
        });
        return;
      }

      // Belt-and-suspenders: a sub-threshold score never counts as a pass even
      // if the model said so.
      const passed = review.passed && review.score >= PASS_THRESHOLD;

      if (passed) {
        // Ready to scaffold. Record the verdict and clear any prior feedback.
        await projectService.updateProject(projectPath, projectSlug, {
          status: 'approved',
          reviewFeedback: '',
        });
      } else {
        // Feed the actionable issues back into the regeneration loop.
        const feedback =
          review.issues.length > 0 ? review.issues.map((i) => `- ${i}`).join('\n') : review.summary;
        await projectService.updateProject(projectPath, projectSlug, {
          status: 'reviewing',
          reviewFeedback: feedback,
        });
      }

      events?.emit('project:prd:reviewed', {
        projectPath,
        projectSlug,
        passed,
        score: review.score,
        issueCount: review.issues.length,
      });

      res.json({ success: true, review: { ...review, passed } });
    } catch (error) {
      logError(error, 'Review PRD failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
