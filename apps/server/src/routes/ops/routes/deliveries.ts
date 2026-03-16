/**
 * Delivery API Routes
 *
 * Provides read access to webhook delivery records and manual retry capability.
 * Mounted at /api/ops/deliveries by the ops route index.
 *
 * Endpoints:
 *   GET  /              - List recent deliveries (query: limit, source, status)
 *   GET  /:id           - Get a single delivery by ID
 *   POST /:id/retry     - Retry a failed delivery
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { EventRouterService, DeliveryStatus } from '../../../services/event-router-service.js';

const VALID_STATUSES: DeliveryStatus[] = ['received', 'completed', 'failed'];

export function createDeliveriesRoutes(eventRouterService: EventRouterService): Router {
  const router = Router();

  /**
   * GET / - List recent deliveries.
   *
   * Query params:
   *   limit  (optional, default 50) - max records to return
   *   source (optional) - filter by signal source (e.g. "github", "discord")
   *   status (optional) - filter by delivery status ("received", "completed", "failed")
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const limitParam = req.query['limit'] as string | undefined;
      const source = req.query['source'] as string | undefined;
      const statusParam = req.query['status'] as string | undefined;

      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      if (isNaN(limit) || limit < 1) {
        res.status(400).json({ success: false, error: 'limit must be a positive integer' });
        return;
      }

      if (statusParam && !VALID_STATUSES.includes(statusParam as DeliveryStatus)) {
        res.status(400).json({
          success: false,
          error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
        });
        return;
      }

      const deliveries = eventRouterService.getDeliveries({
        limit,
        source,
        status: statusParam as DeliveryStatus | undefined,
      });

      res.json({ success: true, deliveries, total: deliveries.length });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  /**
   * GET /:id - Get a single delivery record.
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const delivery = eventRouterService.getDelivery(req.params['id'] as string);
      if (!delivery) {
        res.status(404).json({ success: false, error: 'Delivery not found' });
        return;
      }
      res.json({ success: true, delivery });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  /**
   * POST /:id/retry - Retry a failed delivery.
   *
   * Only deliveries in "failed" status can be retried. Returns the new RouteResult.
   */
  router.post('/:id/retry', async (req: Request, res: Response) => {
    try {
      const result = await eventRouterService.retryDelivery(req.params['id'] as string);
      res.json({ success: true, result });
    } catch (err) {
      const message = (err as Error).message;
      const isNotFound = message.includes('not found');
      const isInvalidState = message.includes('not in failed state');
      const status = isNotFound ? 404 : isInvalidState ? 409 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  return router;
}
