/**
 * Start a GOAP brain loop for a project
 */

import type { Request, Response } from 'express';
import type { GOAPDeps } from '../common.js';
import type { GOAPLoopConfig } from '@automaker/types';
import { DEFAULT_GOAP_LOOP_CONFIG } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GOAPRoutes:Start');

export function createStartGOAPLoopHandler({ goapLoopService }: GOAPDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName, tickIntervalMs } = req.body as {
        projectPath: string;
        branchName?: string | null;
        tickIntervalMs?: number;
      };

      if (!projectPath) {
        res.status(400).json({ error: 'Missing required parameter: projectPath' });
        return;
      }

      if (
        tickIntervalMs !== undefined &&
        (typeof tickIntervalMs !== 'number' || tickIntervalMs <= 0)
      ) {
        res.status(400).json({ error: 'tickIntervalMs must be a positive number' });
        return;
      }

      const config: GOAPLoopConfig = {
        projectPath,
        branchName: branchName ?? DEFAULT_GOAP_LOOP_CONFIG.branchName,
        tickIntervalMs: tickIntervalMs ?? DEFAULT_GOAP_LOOP_CONFIG.tickIntervalMs,
        maxConsecutiveErrors: DEFAULT_GOAP_LOOP_CONFIG.maxConsecutiveErrors,
        enabled: true,
        maxActionHistorySize: DEFAULT_GOAP_LOOP_CONFIG.maxActionHistorySize,
      };

      logger.info('Starting GOAP loop', { projectPath });
      await goapLoopService.startLoop(config);

      res.json({ success: true, status: goapLoopService.getStatus(projectPath) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start GOAP loop';
      const status = message.includes('already running') ? 409 : 500;
      if (status === 500) logger.error('Failed to start GOAP loop', { error });
      res.status(status).json({ error: message });
    }
  };
}
