/**
 * Ledger REST endpoints - Query the event ledger for features, projects, and time ranges.
 *
 * Mounted at /api/ledger in the main server.
 *
 * Endpoints:
 *   GET /events?projectPath=X&featureId=Y  - events for a specific feature
 *   GET /events?projectPath=X&projectSlug=Y - events for a project
 *   GET /events?projectPath=X&since=ISO&until=ISO - time-range query
 *   GET /timeline/:featureId?projectPath=X  - unified timeline (ledger + statusHistory)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { LedgerService } from '../../services/ledger-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';

export function createLedgerRoutes(
  ledgerService: LedgerService,
  featureLoader: FeatureLoader
): Router {
  const router = Router();

  /**
   * GET /events - Query ledger events with optional filters.
   *
   * Query params:
   *   projectPath (required) - absolute path to the project root
   *   featureId   (optional) - filter by feature ID
   *   projectSlug (optional) - filter by project slug
   *   since       (optional) - ISO timestamp lower bound (inclusive)
   *   until       (optional) - ISO timestamp upper bound (inclusive)
   */
  router.get('/events', async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId, projectSlug, since, until } = req.query as Record<
        string,
        string | undefined
      >;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      const filters: { projectSlug?: string; startDate?: string; endDate?: string } = {};
      if (projectSlug) filters.projectSlug = projectSlug;
      if (since) filters.startDate = since;
      if (until) filters.endDate = until;

      let records = await ledgerService.getRecords(projectPath, filters);

      // featureId is not natively supported by LedgerQueryOptions — filter post-query
      if (featureId) {
        records = records.filter((r) => r.featureId === featureId);
      }

      res.json({ success: true, events: records, total: records.length });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  /**
   * GET /timeline/:featureId - Unified timeline for a feature.
   *
   * Merges ledger records with statusHistory from the live feature.json (or archive).
   * Entries are sorted by timestamp ascending.
   *
   * Query params:
   *   projectPath (required) - absolute path to the project root
   */
  router.get('/timeline/:featureId', async (req: Request, res: Response) => {
    try {
      const featureId = req.params['featureId'] as string;
      const projectPath = req.query['projectPath'] as string | undefined;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
        return;
      }

      // Fetch ledger records for this feature
      const allRecords = await ledgerService.getRecords(projectPath as string, {});
      const featureRecords = allRecords.filter((r) => r.featureId === featureId);

      // Fetch live/archived feature for statusHistory
      const feature = await featureLoader.get(projectPath as string, featureId);
      const statusHistory = feature?.statusHistory ?? [];

      type StatusTransitionEntry = {
        type: 'status_transition';
        timestamp: string;
        from: string | null;
        to: string;
        reason?: string;
      };

      type LedgerRecordEntry = {
        type: 'ledger_record';
        timestamp: string;
        recordId: string;
        featureTitle: string;
        finalStatus: string;
        totalCostUsd: number;
        cycleTimeMs: number;
      };

      type TimelineEntry = StatusTransitionEntry | LedgerRecordEntry;

      const entries: TimelineEntry[] = [
        ...statusHistory.map(
          (t): StatusTransitionEntry => ({
            type: 'status_transition',
            timestamp: t.timestamp,
            from: t.from,
            to: t.to,
            reason: t.reason,
          })
        ),
        ...featureRecords.map(
          (r): LedgerRecordEntry => ({
            type: 'ledger_record',
            timestamp: r.timestamp,
            recordId: r.recordId,
            featureTitle: r.featureTitle,
            finalStatus: r.finalStatus,
            totalCostUsd: r.totalCostUsd,
            cycleTimeMs: r.cycleTimeMs,
          })
        ),
      ];

      // Sort chronologically
      entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      res.json({ success: true, featureId, timeline: entries, total: entries.length });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}
