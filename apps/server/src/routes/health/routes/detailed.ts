/**
 * GET /detailed endpoint - Detailed health check
 */

import type { Request, Response } from 'express';
import { getAuthStatus } from '../../../lib/auth.js';
import { getVersion } from '../../../lib/version.js';
import type { CrdtSyncService } from '../../../services/crdt-sync-service.js';

export function createDetailedHandler(crdtSyncService?: CrdtSyncService) {
  return (_req: Request, res: Response): void => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: getVersion(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      dataDir: process.env.DATA_DIR || './data',
      auth: getAuthStatus(),
      env: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      sync: crdtSyncService ? crdtSyncService.getSyncStatus() : null,
    });
  };
}
