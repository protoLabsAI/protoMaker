/**
 * Metrics routes - HTTP API for project metrics and analytics
 */

import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { MetricsService } from '../../services/metrics-service.js';
import type { LedgerService } from '../../services/ledger-service.js';
import type { DoraMetricsService } from '../../services/dora-metrics-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { FrictionTrackerService } from '../../services/friction-tracker-service.js';
import type { AgenticMetricsDocument } from '@protolabsai/types';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createLedgerRoutes } from './ledger.js';
import {
  createDoraHistoryRoute,
  createStageDurationsRoute,
  createFlowRoute,
  createFrictionRoute,
  createFailureBreakdownRoute,
  createBlockedTimelineRoute,
} from './dora.js';

export function createMetricsRoutes(
  metricsService: MetricsService,
  ledgerService?: LedgerService,
  doraMetricsService?: DoraMetricsService,
  featureLoader?: FeatureLoader,
  frictionTrackerService?: FrictionTrackerService
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

  // Mount stage durations route at /api/metrics/stage-durations
  if (featureLoader) {
    router.use('/', createStageDurationsRoute(featureLoader));
  }

  // Mount flow (CFD) route at /api/metrics/flow
  if (featureLoader) {
    router.use('/', createFlowRoute(featureLoader));
  }

  // Mount operational intelligence routes
  if (frictionTrackerService) {
    router.use('/', createFrictionRoute(frictionTrackerService));
  }

  if (featureLoader) {
    router.use('/', createFailureBreakdownRoute(featureLoader));
  }

  // Mount blocked timeline route at /api/metrics/blocked-timeline
  if (featureLoader) {
    router.use('/', createBlockedTimelineRoute(featureLoader));
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

  /**
   * GET /dora - DORA metrics for a project over a time range
   *
   * Query params:
   *   - projectPath (required): path to the project
   *   - timeWindowDays (optional, default 30): rolling window for metric computation
   *
   * Returns DORA metrics: deployment frequency, lead time, change failure rate,
   * recovery time, and rework rate.
   */
  if (doraMetricsService) {
    router.get('/dora', async (req: Request, res: Response) => {
      try {
        const projectPath = req.query.projectPath as string | undefined;
        if (!projectPath) {
          res
            .status(400)
            .json({ success: false, error: 'projectPath query parameter is required' });
          return;
        }

        const timeWindowDaysParam = req.query.timeWindowDays
          ? parseInt(req.query.timeWindowDays as string, 10)
          : undefined;

        if (
          timeWindowDaysParam !== undefined &&
          (isNaN(timeWindowDaysParam) || timeWindowDaysParam < 1)
        ) {
          res
            .status(400)
            .json({ success: false, error: 'timeWindowDays must be a positive integer' });
          return;
        }

        const metrics = await doraMetricsService.getMetrics(projectPath, timeWindowDaysParam);
        res.json({ success: true, metrics });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    });
  }

  /**
   * GET /agentic - Agentic metrics snapshot (autonomy rate, WIP saturation, remediation loops)
   *
   * Query params:
   *   - projectPath (required): path to the project
   *
   * Reads from `.automaker/metrics/agentic.json` — populated by AgenticMetricsService
   * via event subscriptions. Returns the most recent snapshot entry plus a summary.
   */
  router.get('/agentic', (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const agenticPath = path.join(projectPath, '.automaker', 'metrics', 'agentic.json');

      let doc: AgenticMetricsDocument = {
        version: 1,
        updatedAt: new Date().toISOString(),
        entries: [],
      };
      try {
        const raw = fs.readFileSync(agenticPath, 'utf-8');
        doc = JSON.parse(raw) as AgenticMetricsDocument;
      } catch {
        // File may not exist yet — return empty state
      }

      const latest = doc.entries.length > 0 ? doc.entries[doc.entries.length - 1] : null;

      res.json({
        success: true,
        updatedAt: doc.updatedAt,
        latest,
        entryCount: doc.entries.length,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  /**
   * GET /summary - Current project metrics snapshot (GET variant of POST /summary)
   *
   * Query params:
   *   - projectPath (required): path to the project
   *
   * Returns the same data as POST /summary but as a cacheable GET request.
   */
  router.get('/summary', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const metrics = await metricsService.getProjectMetrics(projectPath);
      res.json({ success: true, ...metrics });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}
