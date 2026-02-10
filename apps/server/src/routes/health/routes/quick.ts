/**
 * GET /quick endpoint - Quick health check (<10ms target)
 * Returns minimal information: uptime and version
 * No database or service checks - instant response
 */

import type { Request, Response } from 'express';
import { getVersion } from '../../../lib/version.js';

export function createQuickHandler() {
  return (_req: Request, res: Response): void => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      version: getVersion(),
    });
  };
}
