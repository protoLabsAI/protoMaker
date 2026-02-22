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

      const result = await reviewService.resumeReview(threadId, hitlFeedback);
      res.json(result);
    } catch (error) {
      logError(error, 'Resume antagonistic review flow failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
