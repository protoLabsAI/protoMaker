/**
 * Escalation routes - HTTP API for escalation router
 *
 * Provides endpoints for:
 * - GET /api/escalation/status - Router status and channel information
 * - GET /api/escalation/log - Signal audit log
 */

import { Router, type Request, type Response } from 'express';
import type { EscalationRouter } from '../services/escalation-router.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('EscalationRoutes');

/**
 * Create escalation router with all endpoints
 *
 * @param escalationRouter - Instance of EscalationRouter
 * @returns Express Router configured with escalation endpoints
 */
export function createEscalationRoutes(escalationRouter: EscalationRouter): Router {
  const router = Router();

  /**
   * GET /api/escalation/status
   *
   * Returns router status including:
   * - Registered channels with their priorities and rate limits
   * - Recent send counts per channel
   * - Signal tracking statistics
   */
  router.get('/status', (_req: Request, res: Response) => {
    try {
      const status = escalationRouter.getStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error getting escalation status:', error);
      res.status(500).json({
        error: 'Failed to get escalation status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/escalation/log
   *
   * Returns signal audit log
   *
   * Query params:
   * - limit: Number of entries to return (default: 100)
   */
  router.get('/log', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      if (isNaN(limit) || limit < 1) {
        res.status(400).json({ error: 'Invalid limit parameter' });
        return;
      }

      const log = escalationRouter.getLog(limit);
      res.json({
        entries: log,
        count: log.length,
      });
    } catch (error) {
      logger.error('Error getting escalation log:', error);
      res.status(500).json({
        error: 'Failed to get escalation log',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
