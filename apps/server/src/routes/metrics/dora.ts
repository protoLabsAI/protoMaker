/**
 * GET /api/metrics/dora — DORA metrics endpoint.
 *
 * Returns deployment frequency (features moved to done per day), lead time
 * (backlog→done duration), and change failure rate (blocked/done ratio),
 * computed locally via DoraMetricsService.
 *
 * Also provides GET /api/metrics/dora/history for time-bucketed DORA trend data.
 * Also provides GET /api/metrics/stage-durations for per-feature stage duration analytics.
 * Also provides GET /api/metrics/flow for cumulative flow diagram time-series data.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { DoraMetricsService } from '../../services/dora-metrics-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import type { FrictionTrackerService } from '../../services/friction-tracker-service.js';
import type { FeatureStatus } from '@protolabsai/types';

/** Statuses tracked in stage duration analytics (excludes done/interrupted). */
const TRACKED_STATUSES: FeatureStatus[] = ['backlog', 'in_progress', 'review', 'blocked'];

/** Statuses tracked in the cumulative flow diagram. */
const CFD_STATUSES = ['backlog', 'in_progress', 'review', 'done'] as const;
type CfdStatus = (typeof CFD_STATUSES)[number];

/** Default WIP limit used when none is provided by the caller. */
const DEFAULT_WIP_LIMIT = 3;

/** One day's worth of per-status feature counts. */
export interface FlowDayEntry {
  date: string;
  backlog: number;
  in_progress: number;
  review: number;
  done: number;
}

/** Response shape for GET /api/metrics/flow. */
export interface FlowMetricsResponse {
  success: true;
  days: FlowDayEntry[];
  wipLimit: number;
  statuses: typeof CFD_STATUSES;
}

/**
 * createFlowRoute — mounts GET /flow.
 * Expected mount: router.use('/', createFlowRoute(featureLoader))
 *
 * Replays each feature's statusHistory to reconstruct the board state at every
 * calendar day from the earliest known transition up to today, then returns a
 * time-series array of daily status counts.
 */
export function createFlowRoute(featureLoader: FeatureLoader): Router {
  const router = Router();

  /**
   * GET /flow
   *
   * Query params:
   *   - projectPath (required): path to the project
   *   - days (optional, default 90): number of trailing days to return
   *   - wipLimit (optional, default 3): WIP limit echoed back to the client
   */
  router.get('/flow', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const daysParam = req.query.days ? parseInt(req.query.days as string, 10) : 90;
      const days = isNaN(daysParam) || daysParam < 1 ? 90 : daysParam;

      const wipLimitParam = req.query.wipLimit
        ? parseInt(req.query.wipLimit as string, 10)
        : DEFAULT_WIP_LIMIT;
      const wipLimit =
        isNaN(wipLimitParam) || wipLimitParam < 1 ? DEFAULT_WIP_LIMIT : wipLimitParam;

      const features = await featureLoader.getAll(projectPath);
      const now = Date.now();

      // Determine the date range: last `days` calendar days ending today
      const todayDate = new Date(now);
      todayDate.setHours(0, 0, 0, 0);
      const startDate = new Date(todayDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

      // Build a map: featureId → sorted list of (timestampMs, status) transitions
      // Each transition records the status the feature entered at that timestamp.
      type Transition = { tsMs: number; status: CfdStatus };
      const featureTransitions: Map<string, Transition[]> = new Map();

      for (const feature of features) {
        const history = feature.statusHistory ?? [];
        const transitions: Transition[] = [];

        if (history.length === 0) {
          // No history — treat the feature as having been in its current status
          // since createdAt (or the window start if createdAt is unavailable).
          const status = (feature.status ?? 'backlog') as string;
          const cfdStatus: CfdStatus = CFD_STATUSES.includes(status as CfdStatus)
            ? (status as CfdStatus)
            : 'backlog';
          const createdMs = feature.createdAt
            ? new Date(feature.createdAt).getTime()
            : startDate.getTime();
          transitions.push({ tsMs: createdMs, status: cfdStatus });
        } else {
          for (const entry of history) {
            const status = entry.to as string;
            const cfdStatus: CfdStatus = CFD_STATUSES.includes(status as CfdStatus)
              ? (status as CfdStatus)
              : 'backlog';
            transitions.push({ tsMs: new Date(entry.timestamp).getTime(), status: cfdStatus });
          }
          // Sort ascending by timestamp
          transitions.sort((a, b) => a.tsMs - b.tsMs);
        }

        featureTransitions.set(feature.id, transitions);
      }

      // For each calendar day in the window, determine the status of every feature
      // by finding the last transition on or before midnight of that day.
      const result: FlowDayEntry[] = [];

      for (let d = 0; d < days; d++) {
        const dayStart = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
        const dayEndMs = dayStart.getTime() + 24 * 60 * 60 * 1000 - 1; // end of day

        const counts: Record<CfdStatus, number> = {
          backlog: 0,
          in_progress: 0,
          review: 0,
          done: 0,
        };

        for (const transitions of featureTransitions.values()) {
          if (transitions.length === 0) continue;

          // Find the last transition that occurred on or before this day
          let statusAtDay: CfdStatus | null = null;
          for (const t of transitions) {
            if (t.tsMs <= dayEndMs) {
              statusAtDay = t.status;
            } else {
              break;
            }
          }

          if (statusAtDay !== null) {
            counts[statusAtDay]++;
          }
        }

        result.push({
          date: dayStart.toISOString().slice(0, 10),
          backlog: counts.backlog,
          in_progress: counts.in_progress,
          review: counts.review,
          done: counts.done,
        });
      }

      const response: FlowMetricsResponse = {
        success: true,
        days: result,
        wipLimit,
        statuses: CFD_STATUSES,
      };

      res.json(response);
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}

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

        const totalMs = stages.backlog + stages.in_progress + stages.review + stages.blocked;
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
        in_progress:
          grandTotal > 0 ? Number(((aggStages.in_progress / grandTotal) * 100).toFixed(1)) : 0,
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

// ---------------------------------------------------------------------------
// Operational Intelligence routes
// ---------------------------------------------------------------------------

/** Single friction pattern entry returned by GET /api/metrics/friction. */
export interface FrictionPatternEntry {
  pattern: string;
  count: number;
  lastSeen: string; // ISO 8601
}

/** Response shape for GET /api/metrics/friction. */
export interface FrictionResponse {
  success: true;
  patterns: FrictionPatternEntry[];
  total: number;
}

/**
 * createFrictionRoute — mounts GET /friction.
 * Returns the top recurring failure patterns tracked by FrictionTrackerService,
 * sorted descending by occurrence count.
 */
export function createFrictionRoute(frictionTrackerService: FrictionTrackerService): Router {
  const router = Router();

  /**
   * GET /friction
   *
   * Query params: none (data is in-memory, project-agnostic per instance)
   *
   * Returns:
   *   - patterns: sorted list of { pattern, count, lastSeen }
   *   - total: number of active patterns
   */
  router.get('/friction', (_req: Request, res: Response) => {
    try {
      const raw = frictionTrackerService.getPatterns();
      const patterns: FrictionPatternEntry[] = raw.map((p) => ({
        pattern: p.pattern,
        count: p.count,
        lastSeen: new Date(p.lastSeenMs).toISOString(),
      }));
      const response: FrictionResponse = { success: true, patterns, total: patterns.length };
      res.json(response);
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}

/** Single failure category entry returned by GET /api/metrics/failure-breakdown. */
export interface FailureCategoryEntry {
  category: string;
  count: number;
}

/** Response shape for GET /api/metrics/failure-breakdown. */
export interface FailureBreakdownResponse {
  success: true;
  categories: FailureCategoryEntry[];
  total: number;
}

/**
 * createFailureBreakdownRoute — mounts GET /failure-breakdown.
 * Aggregates failureClassification.category across all features in the project.
 */
export function createFailureBreakdownRoute(featureLoader: FeatureLoader): Router {
  const router = Router();

  /**
   * GET /failure-breakdown
   *
   * Query params:
   *   - projectPath (required): path to the project
   *
   * Returns:
   *   - categories: list of { category, count } sorted descending by count
   *   - total: total number of classified features
   */
  router.get('/failure-breakdown', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const features = await featureLoader.getAll(projectPath);

      // Aggregate failureClassification.category across all features
      const categoryCounts = new Map<string, number>();
      let total = 0;

      for (const feature of features) {
        const classification = feature.failureClassification as
          | { category?: string }
          | null
          | undefined;
        if (classification?.category) {
          const cat = classification.category;
          categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
          total++;
        }
      }

      const categories: FailureCategoryEntry[] = Array.from(categoryCounts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      const response: FailureBreakdownResponse = { success: true, categories, total };
      res.json(response);
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Blocked Timeline routes
// ---------------------------------------------------------------------------

/** Reason category for a blocked period. */
export type BlockedReasonCategory = 'dependency' | 'review' | 'unclear' | 'other';

/** A single blocked period for a feature. */
export interface BlockedPeriod {
  startDate: string;
  endDate: string;
  durationMs: number;
  reason: string;
  category: BlockedReasonCategory;
}

/** Per-feature blocked timeline entry. */
export interface BlockedTimelineEntry {
  featureId: string;
  title: string;
  blockedPeriods: BlockedPeriod[];
  totalBlockedMs: number;
}

/** Response shape for GET /api/metrics/blocked-timeline. */
export interface BlockedTimelineResponse {
  success: true;
  features: BlockedTimelineEntry[];
  featureCount: number;
}

/** Categorise a blocked reason string into one of four buckets. */
function categoriseReason(reason: string | undefined): BlockedReasonCategory {
  if (!reason) return 'unclear';
  const lower = reason.toLowerCase();
  if (lower.includes('depend') || lower.includes('wait') || lower.includes('block')) {
    return 'dependency';
  }
  if (lower.includes('review') || lower.includes('approve') || lower.includes('pr')) {
    return 'review';
  }
  if (lower.includes('unclear') || lower.includes('unknown') || lower.includes('pending')) {
    return 'unclear';
  }
  return 'other';
}

/**
 * createBlockedTimelineRoute — mounts GET /blocked-timeline.
 * Expected mount: router.use('/', createBlockedTimelineRoute(featureLoader))
 */
export function createBlockedTimelineRoute(featureLoader: FeatureLoader): Router {
  const router = Router();

  router.get('/blocked-timeline', async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.projectPath as string | undefined;
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const features = await featureLoader.getAll(projectPath);
      const now = Date.now();
      const result: BlockedTimelineEntry[] = [];

      for (const feature of features) {
        const history = feature.statusHistory ?? [];
        const blockedPeriods: BlockedPeriod[] = [];

        for (let i = 0; i < history.length; i++) {
          const entry = history[i];
          if (entry.to !== 'blocked') continue;

          const startMs = new Date(entry.timestamp).getTime();
          const nextEntry = history[i + 1];
          const endMs = nextEntry ? new Date(nextEntry.timestamp).getTime() : now;
          const durationMs = Math.max(0, endMs - startMs);

          const reason = (entry as { to: string; timestamp: string; reason?: string }).reason ?? '';
          const category = categoriseReason(reason);

          blockedPeriods.push({
            startDate: new Date(startMs).toISOString(),
            endDate: new Date(endMs).toISOString(),
            durationMs,
            reason: reason || 'No reason provided',
            category,
          });
        }

        if (blockedPeriods.length === 0) continue;

        const totalBlockedMs = blockedPeriods.reduce((sum, p) => sum + p.durationMs, 0);

        result.push({
          featureId: feature.id,
          title: feature.title ?? feature.id,
          blockedPeriods,
          totalBlockedMs,
        });
      }

      result.sort((a, b) => b.totalBlockedMs - a.totalBlockedMs);

      const response: BlockedTimelineResponse = {
        success: true,
        features: result,
        featureCount: result.length,
      };

      res.json(response);
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}
