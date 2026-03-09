/**
 * Metrics routes - HTTP API for project metrics and analytics
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { MetricsService } from '../../services/metrics-service.js';
import type { LedgerService } from '../../services/ledger-service.js';
import type { DoraMetricsService } from '../../services/dora-metrics-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createLedgerRoutes } from './ledger.js';
import { createDoraHistoryRoute } from './dora.js';

export function createMetricsRoutes(
  metricsService: MetricsService,
  ledgerService?: LedgerService,
  doraMetricsService?: DoraMetricsService
): Router {
  const router = Router();

  // Mount ledger sub-routes at /api/metrics/ledger/*
  if (ledgerService) {
    router.use('/ledger', createLedgerRoutes(ledgerService));
  }

  // Mount DORA history sub-routes at /api/metrics/dora/*
  if (doraMetricsService) {
    router.use('/dora', createDoraHistoryRoute(doraMetricsService));
  }

  /**
   * POST /summary - Project-level aggregated metrics
   */
  router.post(
    '/summary',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath } = req.body;
        const metrics = await metricsService.getProjectMetrics(projectPath);
        res.json({ success: true, ...metrics });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  );

  /**
   * POST /capacity - Capacity utilization metrics
   */
  router.post(
    '/capacity',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath, maxConcurrency } = req.body;
        const metrics = await metricsService.getCapacityMetrics(projectPath, maxConcurrency);
        res.json({ success: true, ...metrics });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  );

  /**
   * POST /forecast - Estimate duration and cost for a new feature
   * Uses historical averages scaled by complexity multiplier
   */
  router.post(
    '/forecast',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath, complexity = 'medium' } = req.body;

        const metrics = await metricsService.getProjectMetrics(projectPath);

        // Scale historical averages by complexity
        const multipliers: Record<string, number> = {
          small: 0.5,
          medium: 1.0,
          large: 1.5,
          architectural: 2.5,
        };
        const multiplier = multipliers[complexity] ?? 1.0;

        res.json({
          success: true,
          complexity,
          estimatedDurationMs: Math.round(metrics.avgCycleTimeMs * multiplier),
          estimatedAgentTimeMs: Math.round(metrics.avgAgentTimeMs * multiplier),
          estimatedCostUsd: Number((metrics.costPerFeature * multiplier).toFixed(4)),
          basedOnFeatures: metrics.completedFeatures,
          multiplier,
        });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  );

  /**
   * POST /impact-report - Generate Project Impact Report with historical comparison
   * Returns markdown report with cost, time, quality metrics and comparison to historical averages
   */
  router.post(
    '/impact-report',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath, historicalBaseline } = req.body;
        const report = await metricsService.generateImpactReport(projectPath, historicalBaseline);
        res.json({ success: true, report });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  );

  return router;
}
