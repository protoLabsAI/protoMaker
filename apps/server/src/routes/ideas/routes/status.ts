/**
 * POST /api/ideas/status - Get idea processing session status
 *
 * Returns the current status of an idea processing session.
 */

import type { Request, Response } from 'express';
import type { IdeaProcessingService } from '../../../services/idea-processing-service.js';

export function createStatusHandler(ideaService: IdeaProcessingService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId?: string };

      // If no sessionId provided, return list of all sessions
      if (!sessionId) {
        const sessions = await ideaService.listSessions();
        res.json({
          success: true,
          sessions,
        });
        return;
      }

      const session = await ideaService.getSessionStatus(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: `Session ${sessionId} not found`,
        });
        return;
      }

      res.json({
        success: true,
        session,
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
