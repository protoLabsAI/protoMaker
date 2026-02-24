/**
 * Ledger routes - Time-series analytics from the persistent metrics ledger
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { LedgerService } from '../../services/ledger-service.js';
import type { TimeSeriesMetric, TimeGroupBy } from '@protolabs-ai/types';
import { validatePathParams } from '../../middleware/validate-paths.js';

export function createLedgerRoutes(ledgerService: LedgerService): Router {
  const router = Router();

  /**
   * POST /aggregate - Aggregate metrics from ledger (survives archival)
   */
  router.post(
    '/aggregate',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath, startDate, endDate, projectSlug, epicId, complexity } = req.body;
        const metrics = await ledgerService.getAggregateMetrics(projectPath, {
          startDate,
          endDate,
          projectSlug,
          epicId,
          complexity,
        });
        res.json({ success: true, ...metrics });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  );

  /**
   * POST /time-series - Time-series data for charts
   */
  router.post(
    '/time-series',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath, metric, groupBy, startDate, endDate } = req.body;

        const validMetrics: TimeSeriesMetric[] = [
          'cost',
          'throughput',
          'success_rate',
          'cycle_time',
          'pr_throughput',
          'commit_throughput',
        ];
        if (!validMetrics.includes(metric)) {
          res.status(400).json({
            success: false,
            error: `Invalid metric. Must be one of: ${validMetrics.join(', ')}`,
          });
          return;
        }

        const validGroupBy: TimeGroupBy[] = ['day', 'week', 'month'];
        if (groupBy && !validGroupBy.includes(groupBy)) {
          res.status(400).json({
            success: false,
            error: `Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}`,
          });
          return;
        }

        const data = await ledgerService.getTimeSeries(
          projectPath,
          metric as TimeSeriesMetric,
          (groupBy as TimeGroupBy) || 'day',
          { startDate, endDate }
        );
        res.json({ success: true, ...data });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  );

  /**
   * POST /model-distribution - Model cost distribution (pie chart)
   */
  router.post(
    '/model-distribution',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath, startDate, endDate } = req.body;
        const distribution = await ledgerService.getModelDistribution(projectPath, {
          startDate,
          endDate,
        });
        res.json({ success: true, distribution });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  );

  /**
   * POST /cycle-time-distribution - Cycle time histogram buckets
   */
  router.post(
    '/cycle-time-distribution',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath, startDate, endDate } = req.body;
        const buckets = await ledgerService.getCycleTimeDistribution(projectPath, {
          startDate,
          endDate,
        });
        res.json({ success: true, buckets });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  );

  /**
   * POST /backfill - Manually trigger ledger backfill from existing features
   */
  router.post(
    '/backfill',
    validatePathParams('projectPath'),
    async (req: Request, res: Response) => {
      try {
        const { projectPath } = req.body;
        const count = await ledgerService.backfillFromFeatures(projectPath);
        res.json({ success: true, backfilledCount: count });
      } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
      }
    }
  );

  /**
   * POST /enrich - Enrich all ledger records with GitHub PR data
   * Bulk-fetches PR metadata and rewrites the ledger file.
   */
  router.post('/enrich', validatePathParams('projectPath'), async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body;
      const result = await ledgerService.enrichAllRecords(projectPath);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}
