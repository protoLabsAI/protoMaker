/**
 * GET /api/metrics/dora — DORA metrics endpoint.
 *
 * Returns deployment frequency (features moved to done per day), lead time
 * (backlog→done duration), and change failure rate (blocked/done ratio),
 * computed locally via DoraMetricsService and merged with the aggregate CRDT
 * snapshot stored under domain='metrics', id='dora'.
 *
 * Also provides GET /api/metrics/dora/history for time-bucketed DORA trend data.
 * Also provides GET /api/metrics/stage-durations for per-feature stage duration analytics.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DoraMetricsService } from '../../services/dora-metrics-service.js';
import type { CRDTStore } from '@protolabsai/crdt';
import type { MetricsDocument } from '@protolabsai/crdt';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { FeatureStatus } from '@protolabsai/types';

export interface DoraRouteDependencies {
  doraMetricsService: DoraMetricsService;
  crdtStore: CRDTStore;
}

/** Statuses tracked in stage duration analytics (excludes done/interrupted). */
const TRACKED_STATUSES: FeatureStatus[] = ['backlog', 'in_progress', 'review', 'blocked'];

/** Per-feature stage duration entry returned by the /stage-durations endpoint. */
export interface FeatureStageDuration {
  featureId: string;
  title: string;
  /** Duration in milliseconds spent in each tracked status. */
  stages: { backlog: number; in_progress: number; review: number; blocked: number };
  /** Total elapsed time in milliseconds (sum of all tracked stages). */
  totalMs: number;
  /** Flow efficiency: in_progress time / total time (0–1). */
  flowEfficiency: number;
}

/** Aggregate stage percentages across all features. */
export interface StageDurationsAggregate {
  totalMs: number;
  stages: { backlog: number; in_progress: number; review: number; blocked: number };
  /** Percentage of total time spent in each stage (0–100). */
  percentages: { backlog: number; in_progress: number; review: number; blocked: number };
  /** Average flow efficiency across all features (0–1). */
  flowEfficiency: number;
}

/** Response shape for GET /api/metrics/stage-durations. */
export interface StageDurationsResponse {
  success: true;
  features: FeatureStageDuration[];
  aggregate: StageDurationsAggregate;
  featureCount: number;
}

/**
 * createStageDurationsRoute — mounts GET /stage-durations.
 * Expected mount: router.use('/', createStageDurationsRoute(featureLoader))
 */
export function createStageDurationsRoute(featureLoader: FeatureLoader): Router {
  const router = Router();

  /**
   * GET /stage-durations
   *
   * Query params:
   *   - projectPath (required): path to the project
   *
   * Returns per-feature stage durations computed from statusHistory timestamps,
   * plus aggregate percentages and flow efficiency.
   */
  router.get('/stage-durations', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const features = await featureLoader.getAll(projectPath);
      const now = Date.now();

      const featureResults: FeatureStageDuration[] = [];

      for (const feature of features) {
        const history = feature.statusHistory ?? [];
        // Initialise stage buckets
        const stages = {
          backlog: 0,
          in_progress: 0,
          review: 0,
          blocked: 0,
        };

        if (history.length === 0) {
          // No history — if the feature has a current tracked status, treat the
          // entire elapsed time since createdAt as time in that status.
          const currentStatus = feature.status as FeatureStatus | undefined;
          if (currentStatus && TRACKED_STATUSES.includes(currentStatus)) {
            const createdMs = feature.createdAt ? new Date(feature.createdAt).getTime() : now;
            stages[currentStatus as keyof typeof stages] = Math.max(0, now - createdMs);
          }
        } else {
          // Walk pairs of consecutive history entries to compute time in each stage.
          for (let i = 0; i < history.length; i++) {
            const entry = history[i];
            const status = entry.to as FeatureStatus;
            if (!TRACKED_STATUSES.includes(status)) continue;

            const startMs = new Date(entry.timestamp).getTime();
            // End time is the timestamp of the next transition, or now if this is
            // the last entry and the feature is still in this status.
            const nextEntry = history[i + 1];
            const endMs = nextEntry ? new Date(nextEntry.timestamp).getTime() : now;
            const durationMs = Math.max(0, endMs - startMs);
            stages[status as keyof typeof stages] += durationMs;
          }
        }

        const totalMs = (stages.backlog + stages.in_progress + stages.review + stages.blocked);
        const flowEfficiency = totalMs > 0 ? stages.in_progress / totalMs : 0;

        featureResults.push({
          featureId: feature.id,
          title: feature.title ?? feature.id,
          stages,
          totalMs,
          flowEfficiency,
        });
      }

      // Compute aggregate totals and percentages across features that have >0 totalMs
      const featuresWithTime = featureResults.filter((f) => f.totalMs > 0);
      const aggStages = { backlog: 0, in_progress: 0, review: 0, blocked: 0 };
      let grandTotal = 0;

      for (const f of featuresWithTime) {
        aggStages.backlog += f.stages.backlog;
        aggStages.in_progress += f.stages.in_progress;
        aggStages.review += f.stages.review;
        aggStages.blocked += f.stages.blocked;
        grandTotal += f.totalMs;
      }

      const percentages = {
        backlog: grandTotal > 0 ? Number(((aggStages.backlog / grandTotal) * 100).toFixed(1)) : 0,
        in_progress: grandTotal > 0 ? Number(((aggStages.in_progress / grandTotal) * 100).toFixed(1)) : 0,
        review: grandTotal > 0 ? Number(((aggStages.review / grandTotal) * 100).toFixed(1)) : 0,
        blocked: grandTotal > 0 ? Number(((aggStages.blocked / grandTotal) * 100).toFixed(1)) : 0,
      };

      const flowEfficiency =
        grandTotal > 0 ? Number((aggStages.in_progress / grandTotal).toFixed(4)) : 0;

      const response: StageDurationsResponse = {
        success: true,
        features: featureResults,
        featureCount: featureResults.length,
        aggregate: {
          totalMs: grandTotal,
          stages: aggStages,
          percentages,
          flowEfficiency,
        },
      };

      res.json(response);
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
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
