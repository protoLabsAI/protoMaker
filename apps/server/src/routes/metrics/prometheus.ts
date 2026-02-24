/**
 * Prometheus metrics endpoint
 *
 * Exposes server metrics in Prometheus text format for scraping.
 * This endpoint is unauthenticated to allow Prometheus to scrape it.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { register, updateHeapMetrics } from '../../lib/prometheus.js';

export function createPrometheusRoute(): Router {
  const router = Router();

  /**
   * GET /prometheus - Expose metrics in Prometheus text format
   *
   * Returns all registered metrics in Prometheus exposition format.
   * This endpoint must be unauthenticated for Prometheus scraping.
   */
  router.get('/prometheus', async (_req: Request, res: Response) => {
    try {
      // Update heap metrics before scraping
      updateHeapMetrics();

      // Get metrics in Prometheus text format
      const metrics = await register.metrics();

      // Set content type to text/plain for Prometheus
      res.set('Content-Type', register.contentType);
      res.send(metrics);
    } catch (err) {
      res.status(500).send(`# Error generating metrics: ${(err as Error).message}`);
    }
  });

  return router;
}
