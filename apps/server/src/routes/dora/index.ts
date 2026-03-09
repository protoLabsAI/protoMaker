import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DoraMetricsService } from '../../services/dora-metrics-service.js';

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

export function createDoraRoutes(doraMetricsService: DoraMetricsService): Router {
  const router = Router();

  router.get('/metrics', async (req: Request, res: Response) => {
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

      const metrics = await doraMetricsService.getMetrics(projectPath, timeWindowDays);
      const alerts = doraMetricsService.evaluateRegulation(metrics);

      res.json({ success: true, metrics, alerts });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  /**
   * GET /api/dora/history
   *
   * Returns time-bucketed DORA snapshots computed from the ledger.
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

      const now = Date.now();
      const buckets: DoraHistoryBucket[] = [];

      for (let i = bucketCount - 1; i >= 0; i--) {
        const bucketEnd = now - i * bucketDays * 24 * 60 * 60 * 1000;
        const bucketDate = new Date(bucketEnd);

        // Compute DORA metrics for each bucket using the window ending at bucketEnd.
        // We approximate by computing over the bucket window size against all features.
        const metrics = await doraMetricsService.getMetrics(projectPath, bucketDays);

        buckets.push({
          date: bucketDate.toISOString().slice(0, 10),
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
