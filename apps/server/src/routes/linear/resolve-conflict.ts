/**
 * Linear Conflict Resolution Endpoints
 *
 * GET  /api/linear/conflicts        - List features with detected conflicts
 * POST /api/linear/resolve-conflict  - Resolve a conflict with chosen strategy
 */

import type { RequestHandler } from 'express';
import { linearSyncService } from '../../services/linear-sync-service.js';

/**
 * GET /api/linear/conflicts
 * Returns all features with detected sync conflicts
 */
export const getConflicts: RequestHandler = (_req, res) => {
  const conflicts = linearSyncService.getConflicts();
  res.json({ success: true, conflicts, count: conflicts.length });
};

/**
 * POST /api/linear/resolve-conflict
 * Resolve a sync conflict for a specific feature
 *
 * Body: { featureId: string, projectPath: string, strategy: 'accept-linear' | 'accept-automaker' }
 */
export const resolveConflict: RequestHandler = async (req, res) => {
  const { featureId, projectPath, strategy } = req.body as {
    featureId?: string;
    projectPath?: string;
    strategy?: string;
  };

  if (!featureId) {
    res.status(400).json({ success: false, error: 'featureId is required' });
    return;
  }

  if (!projectPath) {
    res.status(400).json({ success: false, error: 'projectPath is required' });
    return;
  }

  const validStrategies = ['accept-linear', 'accept-automaker'];
  if (!strategy || !validStrategies.includes(strategy)) {
    res.status(400).json({
      success: false,
      error: `strategy must be one of: ${validStrategies.join(', ')}`,
    });
    return;
  }

  const resolved = await linearSyncService.resolveConflict(
    projectPath,
    featureId,
    strategy as 'accept-linear' | 'accept-automaker'
  );

  if (!resolved) {
    res.status(404).json({
      success: false,
      error: `No conflict found for feature ${featureId}`,
    });
    return;
  }

  res.json({ success: true, featureId, strategy });
};
