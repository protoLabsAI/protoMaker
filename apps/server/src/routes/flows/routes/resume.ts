/**
 * POST /api/flows/antagonistic-review/resume - Resume flow after HITL interrupt
 */

import type { Request, Response } from 'express';
import type { AntagonisticReviewService } from '../../../services/antagonistic-review-service.js';
import { getErrorMessage, logError } from '../common.js';

export interface ResumeRequest {
  threadId: string;
  hitlFeedback: string;
}

export function createResumeHandler(reviewService: AntagonisticReviewService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { threadId, hitlFeedback } = req.body as ResumeRequest;

      // Validate required fields
      if (!threadId) {
        res.status(400).json({ success: false, error: 'threadId is required' });
        return;
      }

      if (!hitlFeedback) {
        res.status(400).json({ success: false, error: 'hitlFeedback is required' });
        return;
      }

      // TODO: Implement resume logic when HITL (Human-in-the-Loop) support is added
      // For now, return a placeholder response indicating the feature is not yet implemented
      res.status(501).json({
        success: false,
        error:
          'Resume functionality is not yet implemented. HITL interrupts are not currently supported.',
      });
    } catch (error) {
      logError(error, 'Resume antagonistic review flow failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
