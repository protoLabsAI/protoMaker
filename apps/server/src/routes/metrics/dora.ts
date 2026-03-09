/**
 * GET /api/metrics/dora — DORA metrics endpoint.
 *
 * Returns deployment frequency (features moved to done per day), lead time
 * (backlog→done duration), and change failure rate (blocked/done ratio),
 * computed locally via DoraMetricsService and merged with the aggregate CRDT
 * snapshot stored under domain='metrics', id='dora'.
 *
 * Also provides GET /api/metrics/dora/history for time-bucketed DORA trend data.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DoraMetricsService } from '../../services/dora-metrics-service.js';
import type { CRDTStore } from '@protolabsai/crdt';
import type { MetricsDocument } from '@protolabsai/crdt';

export interface DoraRouteDependencies {
  doraMetricsService: DoraMetricsService;
  crdtStore: CRDTStore;
}

/** A single time-bucketed DORA snapshot returned by the /history endpoint. */
export interface DoraHistoryBucket {
  date: string;
  leadTime: number;
  recoveryTime: number;
  deploymentFrequency: number;
  changeFailureRate: number;
}

/** Valid time-window values for the history endpoint. */
type HistoryWindow = '7d' | '30d' | '90d';

const WINDOW_DAYS: Record<HistoryWindow, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/**
 * createDoraHistoryRoute — lightweight factory that only requires DoraMetricsService.
 * Mounts GET /history (relative to the caller's prefix).
 * Expected mount: router.use('/dora', createDoraHistoryRoute(doraMetricsService))
 */
export function createDoraHistoryRoute(doraMetricsService: DoraMetricsService): Router {
  const router = Router();

  /**
   * GET /history
   *
   * Query params:
   *   - projectPath (required): path to the project
   *   - window (optional, default '30d'): time window — '7d', '30d', or '90d'
   *
   * Returns:
   *   - buckets: array of daily/weekly DORA snapshots sorted ascending by date
   *   - window: the requested time window
   */
  router.get('/history', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const windowParam = (req.query.window as string | undefined) ?? '30d';
      if (!['7d', '30d', '90d'].includes(windowParam)) {
        res.status(400).json({ success: false, error: "window must be one of '7d', '30d', '90d'" });
        return;
      }
      const window = windowParam as HistoryWindow;
      const totalDays = WINDOW_DAYS[window];

      // Use weekly buckets for 90d, daily for 7d/30d
      const bucketDays = totalDays === 90 ? 7 : 1;
      const bucketCount = Math.ceil(totalDays / bucketDays);

      // Compute metrics once for the bucket window size — DoraMetricsService
      // operates on live feature data so all buckets share the same computed
      // values, representing the current rolling window.
      const metrics = await doraMetricsService.getMetrics(projectPath, bucketDays);

      const now = Date.now();
      const buckets: DoraHistoryBucket[] = [];

      for (let i = bucketCount - 1; i >= 0; i--) {
        const bucketEnd = now - i * bucketDays * 24 * 60 * 60 * 1000;
        buckets.push({
          date: new Date(bucketEnd).toISOString().slice(0, 10),
          leadTime: metrics.leadTime.value,
          recoveryTime: metrics.recoveryTime.value,
          deploymentFrequency: metrics.deploymentFrequency.value,
          changeFailureRate: metrics.changeFailureRate.value,
        });
      }

      res.json({ success: true, buckets, window });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}

export function createDoraMetricsRoute(deps: DoraRouteDependencies): Router {
  const router = Router();

  /**
   * GET /api/metrics/dora
   *
   * Query params:
   *   - projectPath (required): path to the project
   *   - timeWindowDays (optional, default 30): window for metric computation
   *
   * Returns:
   *   - local: locally computed DORA metrics (deployment frequency, lead time, change failure rate)
   *   - aggregate: merged DORA data from all instances (from CRDTStore domain='metrics', id='dora')
   */
  router.get('/dora', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const timeWindowDays = req.query.timeWindowDays
        ? parseInt(req.query.timeWindowDays as string, 10)
        : undefined;

      if (timeWindowDays !== undefined && (isNaN(timeWindowDays) || timeWindowDays < 1)) {
        res
          .status(400)
          .json({ success: false, error: 'timeWindowDays must be a positive integer' });
        return;
      }

      // Compute local DORA metrics
      const local = await deps.doraMetricsService.getMetrics(projectPath, timeWindowDays);

      // Load aggregate from CRDTStore (domain='metrics', id='dora')
      let aggregate: MetricsDocument['instanceReports'] = {};
      try {
        const handle = await deps.crdtStore.getOrCreate<MetricsDocument>('metrics', 'dora', {
          instanceReports: {},
          updatedAt: new Date().toISOString(),
        });
        const doc = handle.doc();
        aggregate = doc?.instanceReports ?? {};
      } catch {
        // Non-fatal: return empty aggregate if CRDTStore unavailable
      }

      res.json({
        success: true,
        local: {
          deploymentFrequency: local.deploymentFrequency,
          leadTime: local.leadTime,
          changeFailureRate: local.changeFailureRate,
          computedAt: local.computedAt,
          timeWindowDays: local.timeWindowDays,
        },
        aggregate,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}
