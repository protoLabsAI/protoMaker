/**
 * Linear Sync Status Endpoint
 *
 * GET /api/linear/sync-status
 *
 * Returns the current state of Linear sync including:
 * - Whether sync is enabled
 * - Metrics (operations, errors, conflicts, durations)
 * - Recent sync activity
 * - Per-feature sync state
 */

import type { RequestHandler } from 'express';
import { linearSyncService } from '../../services/linear-sync-service.js';

export const getSyncStatus: RequestHandler = (_req, res) => {
  const metrics = linearSyncService.getMetrics();
  const recentActivity = linearSyncService.getRecentActivity(20);

  res.json({
    enabled: linearSyncService.isRunning(),
    metrics,
    recentActivity,
  });
};
