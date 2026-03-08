/**
 * Work-steal routes — exposes work-steal protocol status for the hivemind dashboard.
 *
 * These routes are informational only. The actual work-steal protocol is driven
 * by the AvaChannelReactorService via the Ava Channel CRDT, not by HTTP calls.
 *
 * GET /api/hivemind/work-steal/status  — returns the current work-steal configuration.
 */

import { Router } from 'express';
import type { AvaChannelReactorService } from '../../services/ava-channel-reactor-service.js';

export function createWorkStealRoutes(reactorService: AvaChannelReactorService): Router {
  const router = Router();

  /**
   * GET /status
   *
   * Returns the work-steal status from the reactor service.
   * Includes whether the reactor is active and how many responses have been sent.
   */
  router.get('/status', (_req, res) => {
    const status = reactorService.getStatus();
    res.json({
      active: status.active,
      enabled: status.enabled,
      maxFeaturesPerCycle: 2,
      responsesSent: status.responsesSent,
      errorCount: status.errorCount,
    });
  });

  return router;
}
