/**
 * GET /api/ava/status - Gateway health status endpoint
 */

import type { Request, Response } from 'express';
import type { AvaGatewayService } from '../../../services/ava-gateway-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('AvaStatusRoute');

export function createStatusHandler(avaGatewayService: AvaGatewayService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = avaGatewayService.getStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Failed to get Ava Gateway status:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'internal_error',
        },
      });
    }
  };
}
