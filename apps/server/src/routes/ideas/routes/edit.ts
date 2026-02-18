/**
 * POST /api/ideas/:sessionId/edit/:nodeId - Edit state and re-execute from node
 *
 * Patches state at target node before resuming execution.
 * Creates a checkpoint branch to preserve original history.
 */

import type { Request, Response } from 'express';
import type { IdeaProcessingService } from '../../../services/idea-processing-service.js';

export function createEditHandler(ideaService: IdeaProcessingService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, nodeId } = req.params as {
        sessionId: string;
        nodeId: string;
      };

      const { statePatch } = req.body as {
        statePatch: Record<string, unknown>;
      };

      if (!sessionId || !nodeId) {
        res.status(400).json({
          success: false,
          error: 'sessionId and nodeId are required',
        });
        return;
      }

      if (!statePatch || typeof statePatch !== 'object') {
        res.status(400).json({
          success: false,
          error: 'statePatch is required and must be an object',
        });
        return;
      }

      await ideaService.editNode({
        sessionId,
        nodeId,
        statePatch,
      });

      res.json({
        success: true,
        message: `Editing node ${nodeId} and re-executing`,
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
