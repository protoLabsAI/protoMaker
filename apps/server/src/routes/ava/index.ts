/**
 * Ava Gateway routes - HTTP API for Ava Gateway status and per-project config
 */

import { Router, type Request, type Response } from 'express';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@protolabs-ai/utils';

import type { ServiceContainer } from '../../server/services.js';
import { createStatusHandler } from './routes/status.js';

const logger = createLogger('AvaRoutes');

/**
 * Per-project Ava configuration stored in {projectPath}/.automaker/ava-config.json
 */
export interface AvaConfig {
  projectPath: string;
  enabled: boolean;
  infraChannelId?: string;
  heartbeatIntervalMs?: number;
}

const DEFAULT_AVA_CONFIG: Omit<AvaConfig, 'projectPath'> = {
  enabled: false,
  infraChannelId: undefined,
  heartbeatIntervalMs: 60000,
};

function getAvaConfigPath(projectPath: string): string {
  return join(projectPath, '.automaker', 'ava-config.json');
}

async function readAvaConfig(projectPath: string): Promise<AvaConfig> {
  const configPath = getAvaConfigPath(projectPath);
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AvaConfig>;
    return { ...DEFAULT_AVA_CONFIG, projectPath, ...parsed };
  } catch {
    return { ...DEFAULT_AVA_CONFIG, projectPath };
  }
}

async function writeAvaConfig(config: AvaConfig): Promise<void> {
  const configPath = getAvaConfigPath(config.projectPath);
  const dir = join(config.projectPath, '.automaker');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function createAvaRoutes(services: ServiceContainer): Router {
  const router = Router();

  // Existing gateway status endpoint
  router.get('/status', createStatusHandler(services.avaGatewayService));

  /**
   * POST /api/ava/config/get
   * Body: { projectPath: string }
   * Returns: AvaConfig
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

      const config = await readAvaConfig(projectPath);

      res.json({ success: true, data: config });
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
   * Returns: updated AvaConfig
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

      const existing = await readAvaConfig(projectPath);
      const updated: AvaConfig = { ...existing, ...configUpdate, projectPath };

      await writeAvaConfig(updated);

      // Reflect config changes in the live gateway service if applicable
      if (updated.infraChannelId) {
        services.avaGatewayService.setInfraChannelId(updated.infraChannelId);
      }

      res.json({ success: true, data: updated });
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
