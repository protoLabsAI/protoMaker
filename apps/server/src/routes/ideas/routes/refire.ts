/**
 * POST /api/ideas/:sessionId/refire/:nodeId - Refire from a specific node
 *
 * Loads checkpoint at target node and re-executes from that point.
 * Preserves original execution history via checkpoint branching.
 */

import type { Request, Response } from 'express';
import type { IdeaProcessingService } from '../../../services/idea-processing-service.js';

export function createRefireHandler(ideaService: IdeaProcessingService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, nodeId } = req.params as {
        sessionId: string;
        nodeId: string;
      };

      if (!sessionId || !nodeId) {
        res.status(400).json({
          success: false,
          error: 'sessionId and nodeId are required',
        });
        return;
      }

      await ideaService.refireNode({
        sessionId,
        nodeId,
      });

      res.json({
        success: true,
        message: `Refiring from node ${nodeId}`,
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
