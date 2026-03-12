/**
 * GET /log-path endpoint - Return the absolute server log file path
 *
 * Unauthenticated so the MCP tool can discover the correct log path
 * even when calling from the monorepo root (different CWD than the server).
 */

import type { Request, Response } from 'express';
import { getServerLogPath } from '../../../lib/server-log.js';

export function createLogPathHandler() {
  return (_req: Request, res: Response): void => {
    res.json({
      logPath: getServerLogPath(),
    });
  };
}
