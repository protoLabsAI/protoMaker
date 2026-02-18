/**
 * GET /api/ideas - List all idea processing sessions
 *
 * Returns a summary of all sessions with counts and status.
 */

import type { Request, Response } from 'express';
import type { IdeaProcessingService } from '../../../services/idea-processing-service.js';

export function createListHandler(ideaService: IdeaProcessingService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessions = await ideaService.listSessions();

      res.json({
        success: true,
        sessions,
        count: sessions.length,
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
