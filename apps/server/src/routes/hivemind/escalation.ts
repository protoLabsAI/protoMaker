/**
 * Escalation routes — exposes escalation protocol controls for the hivemind dashboard.
 *
 * These routes allow operators to:
 * - Trigger an escalation_request for a blocked feature (POST /api/hivemind/escalation/request)
 * - Query current degraded peer state (GET /api/hivemind/escalation/degraded-peers)
 *
 * The escalation protocol itself is driven by the AvaChannelReactorService via
 * the Ava Channel CRDT. HTTP routes serve as an operator interface and status endpoint.
 */

import { Router } from 'express';
import type { AvaChannelReactorService } from '../../services/ava-channel-reactor-service.js';

export function createEscalationRoutes(reactorService: AvaChannelReactorService): Router {
  const router = Router();

  /**
   * POST /request
   *
   * Manually trigger an escalation_request for a blocked feature.
   * Body: { featureId, failureCount, lastError, worktreeState, featureData }
   *
   * Returns 400 if failureCount < 2 (escalation threshold not met).
   * Returns 503 if reactor is not active.
   */
  router.post('/request', async (req, res) => {
    const { featureId, failureCount, lastError, worktreeState, featureData } = req.body as {
      featureId?: string;
      failureCount?: number;
      lastError?: string;
      worktreeState?: string;
      featureData?: Record<string, unknown>;
    };

    if (!featureId || typeof featureId !== 'string') {
      res.status(400).json({ error: 'featureId is required' });
      return;
    }

    if (typeof failureCount !== 'number' || failureCount < 2) {
      res.status(400).json({
        error: 'failureCount must be a number >= 2 to trigger escalation',
      });
      return;
    }

    const status = reactorService.getStatus();
    if (!status.active) {
      res.status(503).json({ error: 'Reactor is not active on this instance' });
      return;
    }

    try {
      await reactorService.postEscalationRequest({
        featureId,
        failureCount,
        lastError: lastError ?? 'Unknown error',
        worktreeState: worktreeState ?? 'unknown',
        featureData: featureData ?? {},
      });

      res.json({
        ok: true,
        featureId,
        failureCount,
        message: 'escalation_request posted to Ava Channel',
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to post escalation_request',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

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
   * Returns escalation-relevant reactor status fields.
   */
  router.get('/status', (_req, res) => {
    const status = reactorService.getStatus();
    res.json({
      active: status.active,
      enabled: status.enabled,
      pendingEscalations: status.pendingEscalationCount,
      degradedPeerCount: status.degradedPeerCount,
      errorCount: status.errorCount,
    });
  });

  return router;
}
