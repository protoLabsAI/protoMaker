/**
 * POST /api/briefing/ack - Acknowledge briefing delivery
 *
 * Request body: {
 *   projectPath: string,
 *   acknowledgeUntil?: string (ISO timestamp, defaults to now)
 * }
 * Response: {
 *   success: true,
 *   acknowledgedAt: string
 * }
 */

import type { Request, Response } from 'express';
import type { BriefingCursorService } from '../../../services/briefing-cursor-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createAckHandler(briefingCursorService: BriefingCursorService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, acknowledgeUntil } = req.body as {
        projectPath: string;
        acknowledgeUntil?: string;
      };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Update cursor to provided timestamp or current time
      const acknowledgedAt = acknowledgeUntil || new Date().toISOString();
      await briefingCursorService.setCursor(projectPath, acknowledgedAt);

      res.json({
        success: true,
        acknowledgedAt,
      });
    } catch (error) {
      logError(error, 'Acknowledge briefing failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
