/**
 * GET /api/projects/:slug/fleet-status
 *
 * Returns the aggregated fleet execution status for a project.
 * Queries the FleetSchedulerService for cross-instance phase progress events
 * and returns a per-instance, per-phase breakdown.
 *
 * Response shape:
 * {
 *   success: true,
 *   projectSlug: string,
 *   phases: Array<{
 *     milestoneSlug: string;
 *     phaseName: string;
 *     instanceId: string;
 *     status: 'in_progress' | 'done' | 'failed';
 *     timestamp: string;
 *     error?: string;
 *   }>
 * }
 */

import type { Request, Response } from 'express';
import type { FleetSchedulerService } from '../../services/fleet-scheduler-service.js';

export function createFleetStatusHandler(fleetScheduler: FleetSchedulerService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };

      if (!slug) {
        res.status(400).json({ success: false, error: 'Project slug is required' });
        return;
      }

      const fleetStatus = fleetScheduler.getProjectFleetStatus(slug);

      res.json({
        success: true,
        projectSlug: fleetStatus.projectSlug,
        phases: fleetStatus.phases,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  };
}
