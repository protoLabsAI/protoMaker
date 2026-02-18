/**
 * POST /api/ideas - Create a new idea processing session
 *
 * Cleaner URL alternative to POST /api/ideas/process (maintained for backward compatibility).
 * Starts a new idea processing session through the LangGraph flow.
 */

import type { Request, Response } from 'express';
import type { IdeaProcessingService } from '../../../services/idea-processing-service.js';

export function createCreateHandler(ideaService: IdeaProcessingService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { idea, autoApprove, countdownSeconds } = req.body as {
        idea: string;
        autoApprove?: boolean;
        countdownSeconds?: number;
      };

      if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Idea is required and must be a non-empty string',
        });
        return;
      }

      const sessionId = await ideaService.processIdea({
        idea: idea.trim(),
        autoApprove,
        countdownSeconds,
      });

      res.status(201).json({
        success: true,
        sessionId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  };
}
