/**
 * POST /stop-feature endpoint - Stop a specific feature
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createStopFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId, targetStatus } = req.body as {
        featureId: string;
        targetStatus?: string;
      };

      if (!featureId) {
        res.status(400).json({ success: false, error: 'featureId is required' });
        return;
      }

      const stopped = await autoModeService.stopFeature(featureId, targetStatus);
      res.json({ success: true, stopped });
    } catch (error) {
      logError(error, 'Stop feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
