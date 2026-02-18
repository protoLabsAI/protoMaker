/**
 * GET /api/ideas/:sessionId - Get detailed session with graph definition
 *
 * Returns the full session details including graph definition for a specific session.
 */

import type { Request, Response } from 'express';
import type { IdeaProcessingService } from '../../../services/idea-processing-service.js';

export function createGetHandler(ideaService: IdeaProcessingService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;

      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'sessionId is required',
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
