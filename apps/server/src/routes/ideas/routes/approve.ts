/**
 * POST /api/ideas/:sessionId/approve - Approve an idea processing session
 *
 * Approves a session awaiting user input and resumes the flow.
 */

import type { Request, Response } from 'express';
import type { IdeaProcessingService } from '../../../services/idea-processing-service.js';

export function createApproveHandler(ideaService: IdeaProcessingService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { feedback } = req.body as { feedback?: string };

      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'sessionId is required',
        });
        return;
      }

      await ideaService.resumeSession({
        sessionId,
        approved: true,
        feedback,
      });

      res.json({
        success: true,
        message: 'Session approved and resumed',
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
