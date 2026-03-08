/**
 * GET /api/metrics/dora — DORA metrics endpoint.
 *
 * Returns deployment frequency (features moved to done per day), lead time
 * (backlog→done duration), and change failure rate (blocked/done ratio),
 * computed locally via DoraMetricsService and merged with the aggregate CRDT
 * snapshot stored under domain='metrics', id='dora'.
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
