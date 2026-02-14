/**
 * POST /api/flows/antagonistic-review/execute - Execute antagonistic review flow
 */

import type { Request, Response } from 'express';
import type { AntagonisticReviewService } from '../../../services/antagonistic-review-service.js';
import type { SPARCPrd } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export interface ExecuteRequest {
  projectPath: string;
  prd: SPARCPrd;
  config?: {
    distillationDepth?: number;
    preApproved?: boolean;
    hitlFeedback?: string;
  };
}

export function createExecuteHandler(reviewService: AntagonisticReviewService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prd, config } = req.body as ExecuteRequest;

      // Validate required fields
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!prd) {
        res.status(400).json({ success: false, error: 'prd is required' });
        return;
      }

      // Validate PRD structure (SPARC format)
      if (!prd.situation || !prd.problem || !prd.approach || !prd.results) {
        res.status(400).json({
          success: false,
          error: 'prd must include situation, problem, approach, and results',
        });
        return;
      }

      // Generate PRD ID if not provided
      const prdId = `prd-${Date.now()}`;

      // Execute the review flow
      const result = await reviewService.executeReview({
        prd,
        prdId,
        projectPath,
      });

      // Return result with trace information if available
      const response: any = {
        success: result.success,
        result,
      };

      // Add trace information if observability is configured
      // Note: Langfuse integration would be added here in the future
      if (process.env.LANGFUSE_PUBLIC_KEY) {
        response.trace = {
          traceId: `trace-${prdId}`,
          totalCostUsd: 0, // TODO: Calculate actual cost from agent executions
          durationMs: result.totalDurationMs,
        };
      }

      res.json(response);
    } catch (error) {
      logError(error, 'Execute antagonistic review flow failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
