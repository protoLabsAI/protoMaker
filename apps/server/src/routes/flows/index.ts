/**
 * Flows routes - HTTP API for LangGraph flow execution
 *
 * Provides endpoints for executing various LangGraph flows including:
 * - Antagonistic review flow (execute + resume after HITL)
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@automaker/utils';
import { createAntagonisticReviewAdapter } from '../../services/antagonistic-review-adapter.js';
import type { SPARCPrd } from '@automaker/types';

const logger = createLogger('FlowsRoutes');

/**
 * Create the flows router
 */
export function createFlowsRoutes(): Router {
  const router = Router();

  /**
   * POST /api/flows/antagonistic-review
   * Execute antagonistic review flow for a PRD
   */
  router.post('/antagonistic-review', async (req: Request, res: Response) => {
    try {
      const { projectPath, prdTitle, prdDescription, config } = req.body;

      if (!projectPath || !prdTitle || !prdDescription) {
        res.status(400).json({ error: 'projectPath, prdTitle, and prdDescription are required' });
        return;
      }

      // Parse PRD description into SPARC format
      const prd = parsePRDDescription(prdDescription);
      if (!prd) {
        res.status(400).json({
          error:
            'Invalid PRD format. Expected SPARC format (Situation, Problem, Approach, Results, Constraints)',
        });
        return;
      }

      // Create adapter with config
      const adapter = createAntagonisticReviewAdapter(config);

      // Execute review
      const result = await adapter.executeReview({
        prd,
        prdId: prdTitle,
        projectPath,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('Antagonistic review flow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/flows/antagonistic-review/resume
   * Resume antagonistic review flow after HITL interrupt
   */
  router.post('/antagonistic-review/resume', async (req: Request, res: Response) => {
    try {
      const { threadId, hitlFeedback } = req.body;

      if (!threadId) {
        res.status(400).json({ success: false, error: 'threadId is required' });
        return;
      }

      if (!hitlFeedback) {
        res.status(400).json({ success: false, error: 'hitlFeedback is required' });
        return;
      }

      // TODO: Implement resume logic when HITL support is added
      res.status(501).json({
        success: false,
        error:
          'Resume functionality is not yet implemented. HITL interrupts are not currently supported.',
      });
    } catch (error: any) {
      logger.error('Resume antagonistic review flow failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

/**
 * Parse PRD description string into SPARC format
 */
function parsePRDDescription(description: string): SPARCPrd | null {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(description);
    if (parsed.situation && parsed.problem && parsed.approach && parsed.results) {
      return {
        situation: parsed.situation,
        problem: parsed.problem,
        approach: parsed.approach,
        results: parsed.results,
        constraints: parsed.constraints || '',
        generatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Not JSON, try markdown parsing
  }

  // Parse markdown format
  const situationMatch = description.match(/##?\s*Situation\s*\n+([\s\S]*?)(?=##?\s*Problem|$)/i);
  const problemMatch = description.match(/##?\s*Problem\s*\n+([\s\S]*?)(?=##?\s*Approach|$)/i);
  const approachMatch = description.match(/##?\s*Approach\s*\n+([\s\S]*?)(?=##?\s*Results|$)/i);
  const resultsMatch = description.match(/##?\s*Results\s*\n+([\s\S]*?)(?=##?\s*Constraints|$)/i);
  const constraintsMatch = description.match(/##?\s*Constraints\s*\n+([\s\S]*?)$/i);

  if (situationMatch && problemMatch && approachMatch && resultsMatch) {
    return {
      situation: situationMatch[1].trim(),
      problem: problemMatch[1].trim(),
      approach: approachMatch[1].trim(),
      results: resultsMatch[1].trim(),
      constraints: constraintsMatch ? constraintsMatch[1].trim() : '',
      generatedAt: new Date().toISOString(),
    };
  }

  // If no sections found, treat entire description as approach
  return {
    situation: 'Not specified',
    problem: 'Not specified',
    approach: description,
    results: 'Not specified',
    constraints: '',
    generatedAt: new Date().toISOString(),
  };
}
