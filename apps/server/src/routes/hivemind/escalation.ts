/**
 * Escalation routes — exposes reactor health and degraded-peer status for the hivemind dashboard.
 *
 * Feature-level escalation negotiation has been removed. Ava now handles blocked projects
 * directly via the assign_project MCP tool when a project_blocked broadcast is received.
 */

import { Router } from 'express';
import type { AvaChannelReactorService } from '../../services/ava-channel-reactor-service.js';

export function createEscalationRoutes(reactorService: AvaChannelReactorService): Router {
  const router = Router();

  /**
   * GET /degraded-peers
   *
   * Returns the list of peer instanceIds currently paused due to health alerts.
   * Work-stealing is suppressed for these peers until the 5-minute pause expires.
   */
  router.get('/degraded-peers', (_req, res) => {
    const status = reactorService.getStatus();
    res.json({
      degradedPeerCount: status.degradedPeerCount,
      degradedPeers: status.degradedPeers,
    });
  });

  /**
   * GET /status
   *
   * Returns reactor status fields relevant to health and capacity.
   */
  router.get('/status', (_req, res) => {
    const status = reactorService.getStatus();
    res.json({
      active: status.active,
      enabled: status.enabled,
      degradedPeerCount: status.degradedPeerCount,
      errorCount: status.errorCount,
    });
  });

  return router;
}
