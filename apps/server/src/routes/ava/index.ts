/**
 * Ava Gateway routes - HTTP API for Ava Gateway status and per-project config
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';

import type { ServiceContainer } from '../../server/services.js';
import { createStatusHandler } from './routes/status.js';
import { loadAvaConfig, saveAvaConfig } from '../chat/ava-config.js';
import type { AvaConfig } from '../chat/ava-config.js';

export type { AvaConfig };

const logger = createLogger('AvaRoutes');

export function createAvaRoutes(services: ServiceContainer): Router {
  const router = Router();

  // Existing gateway status endpoint
  router.get('/status', createStatusHandler(services.avaGatewayService));

  /**
   * POST /api/ava/config/get
   * Body: { projectPath: string }
   * Returns: { success: true, config: AvaConfig }
   */
  router.post('/config/get', async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'projectPath is required', type: 'validation_error' },
        });
        return;
      }

      const config = await loadAvaConfig(projectPath);
      res.json({ success: true, config });
    } catch (error) {
      logger.error('Failed to get Ava config:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'internal_error',
        },
      });
    }
  });

  /**
   * POST /api/ava/config/update
   * Body: { projectPath: string, config: Partial<AvaConfig> }
   * Returns: { success: true, config: AvaConfig }
   */
  router.post('/config/update', async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, config: configUpdate } = req.body as {
        projectPath?: string;
        config?: Partial<AvaConfig>;
      };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'projectPath is required', type: 'validation_error' },
        });
        return;
      }

      if (!configUpdate || typeof configUpdate !== 'object') {
        res.status(400).json({
          success: false,
          error: { message: 'config is required', type: 'validation_error' },
        });
        return;
      }

      const config = await saveAvaConfig(projectPath, configUpdate);
      res.json({ success: true, config });
    } catch (error) {
      logger.error('Failed to update Ava config:', error);
      res.status(500).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'internal_error',
        },
      });
    }
  });

  return router;
}
