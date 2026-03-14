/**
 * Hivemind routes — exposes peer/instance status for the unified dashboard.
 *
 * GET /api/hivemind/peers  — returns all known peers with identity, status,
 *                            and capacity metrics.
 */

import { Router } from 'express';
import type { PeerMeshService } from '../../services/peer-mesh-service.js';

export function createHivemindRoutes(crdtSyncService: PeerMeshService): Router {
  const router = Router();

  /**
   * GET /peers
   *
   * Returns all peers known to this instance (online and offline).
   * Each peer includes status (online/offline/draining) and capacity metrics.
   */
  router.get('/peers', (_req, res) => {
    const peers = crdtSyncService.getPeers();
    res.json({ peers });
  });

  /**
   * GET /status
   *
   * Returns the full sync status for this instance, including peer count,
   * role, and capacity summary. Convenience alias for /api/health/detailed
   * that only surfaces hivemind-relevant fields.
   */
  router.get('/status', (_req, res) => {
    const status = crdtSyncService.getSyncStatus();
    res.json(status);
  });

  /**
   * GET /self
   *
   * Returns the instanceId of this Automaker instance. Used by the UI to
   * know which instance it is talking to, for the cross-instance dashboard.
   */
  router.get('/self', (_req, res) => {
    res.json({ instanceId: crdtSyncService.getInstanceId() });
  });

  return router;
}
