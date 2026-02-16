/**
 * POST /api/ideas/resume - Resume an interrupted idea processing session
 *
 * Resumes an idea processing session that is awaiting user approval.
 * Used for HITL (human-in-the-loop) checkpoints.
 */

import type { Request, Response } from 'express';
import type { IdeaProcessingService } from '../../../services/idea-processing-service.js';

export function createResumeHandler(ideaService: IdeaProcessingService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, approved, feedback } = req.body as {
        sessionId: string;
        approved: boolean;
        feedback?: string;
      };

      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'sessionId is required and must be a string',
        });
        return;
      }

      if (typeof approved !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'approved is required and must be a boolean',
        });
        return;
      }

      await ideaService.resumeSession({
        sessionId,
        approved,
        feedback,
      });

      res.json({
        success: true,
        message: approved ? 'Session resumed and approved' : 'Session rejected',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = errorMessage.includes('not found') ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
      });
    }
  };
}
