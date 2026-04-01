/**
 * Ops events routes - Correlated event query endpoints
 *
 * Provides read access to the in-memory correlated event store.
 * Mounted at /api/ops/events by the ops route index.
 *
 * Endpoints:
 *   GET /              - Query events with filtering and pagination
 *   GET /chain/:id     - Get a full causal chain by correlation ID
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type { EventStore } from '../../../lib/event-store.js';

export function createEventsRoutes(eventStore: EventStore): Router {
  const router = Router();

  /**
   * GET / - Query correlated events.
   *
   * Query params:
   *   correlationId (optional) - Filter by correlation ID
   *   featureId     (optional) - Filter by feature ID (searches payloads)
   *   topic         (optional) - Filter by event topic
   *   since         (optional) - Lower bound timestamp (epoch ms)
   *   until         (optional) - Upper bound timestamp (epoch ms)
   *   limit         (optional, default 100) - Max events to return
   *   offset        (optional, default 0)   - Pagination offset
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const correlationId = req.query['correlationId'] as string | undefined;
      const featureId = req.query['featureId'] as string | undefined;
      const topic = req.query['topic'] as string | undefined;
      const sinceParam = req.query['since'] as string | undefined;
      const untilParam = req.query['until'] as string | undefined;
      const limitParam = req.query['limit'] as string | undefined;
      const offsetParam = req.query['offset'] as string | undefined;

      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      if (limitParam && (isNaN(limit!) || limit! < 1)) {
        res.status(400).json({ success: false, error: 'limit must be a positive integer' });
        return;
      }

      const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;
      if (offsetParam && (isNaN(offset!) || offset! < 0)) {
        res.status(400).json({ success: false, error: 'offset must be a non-negative integer' });
        return;
      }

      const since = sinceParam ? parseInt(sinceParam, 10) : undefined;
      if (sinceParam && isNaN(since!)) {
        res.status(400).json({ success: false, error: 'since must be a valid timestamp' });
        return;
      }

      const until = untilParam ? parseInt(untilParam, 10) : undefined;
      if (untilParam && isNaN(until!)) {
        res.status(400).json({ success: false, error: 'until must be a valid timestamp' });
        return;
      }

      const result = eventStore.query({
        correlationId,
        featureId,
        topic,
        since,
        until,
        limit,
        offset,
      });

      res.json({
        success: true,
        events: result.events,
        total: result.total,
        storeSize: eventStore.size(),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  /**
   * GET /chain/:correlationId - Get a full causal chain.
   *
   * Returns all events sharing the given correlationId, ordered by timestamp,
   * with computed chain metadata (startTime, endTime, duration).
   */
  router.get('/chain/:correlationId', (req: Request, res: Response) => {
    try {
      const correlationId = req.params['correlationId'] as string;
      const chain = eventStore.getChain(correlationId);

      if (chain.events.length === 0) {
        res.status(404).json({
          success: false,
          error: `No events found for correlationId: ${correlationId}`,
        });
        return;
      }

      res.json({ success: true, chain });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}
