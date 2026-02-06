/**
 * Set role override for a GOAP brain loop
 */

import type { Request, Response } from 'express';
import type { GOAPDeps } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('GOAPRoutes:SetRole');

export function createSetRoleHandler({ goapLoopService }: GOAPDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, roleId } = req.body as { projectPath: string; roleId?: string | null };

      if (!projectPath) {
        res.status(400).json({ error: 'Missing required parameter: projectPath' });
        return;
      }

      logger.info('Setting GOAP role override', { projectPath, roleId });
      goapLoopService.setRoleOverride(projectPath, roleId ?? null);

      res.json({ success: true, status: goapLoopService.getStatus(projectPath) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set role override';
      const isClientError = message.includes('No GOAP loop');
      const status = isClientError ? 409 : 500;
      if (!isClientError) logger.error('Failed to set role override', { error });
      res.status(status).json({ error: message });
    }
  };
}
