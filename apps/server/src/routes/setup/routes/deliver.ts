import type { RequestHandler } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { deliveryService } from '../../../services/delivery-service.js';

const logger = createLogger('setup:deliver');

interface DeliverRequest {
  clientRepoUrl: string;
  scoreBefore?: number;
  scoreAfter?: number;
  gapsSummary?: string;
  changesMade?: string[];
  alignmentPerformed?: boolean;
}

interface DeliverResponse {
  success: boolean;
  prUrl?: string;
  forkUrl?: string;
  error?: string;
}

/**
 * POST /api/setup/deliver
 * Deliver alignment work back to client repo via fork+PR
 */
export function createDeliverHandler(): RequestHandler<unknown, DeliverResponse, DeliverRequest> {
  return async (req, res) => {
    try {
      const {
        clientRepoUrl,
        scoreBefore,
        scoreAfter,
        gapsSummary,
        changesMade,
        alignmentPerformed,
      } = req.body;

      if (!clientRepoUrl) {
        res.status(400).json({
          success: false,
          error: 'clientRepoUrl is required',
        });
        return;
      }

      logger.info('Deliver request received', {
        clientRepoUrl,
        scoreBefore,
        scoreAfter,
        alignmentPerformed,
      });

      const result = await deliveryService.deliver({
        clientRepoUrl,
        scoreBefore,
        scoreAfter,
        gapsSummary,
        changesMade,
        alignmentPerformed,
      });

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      logger.info('Delivery completed successfully', {
        prUrl: result.prUrl,
        forkUrl: result.forkUrl,
      });

      res.json(result);
    } catch (error) {
      logger.error('Deliver request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
