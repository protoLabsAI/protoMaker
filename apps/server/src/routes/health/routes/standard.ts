/**
 * GET /standard endpoint - Standard health check (<100ms target)
 * Returns system overview: uptime, version, board summary, agent counts
 * Lightweight service checks without deep probing
 */

import type { Request, Response } from 'express';
import { getVersion } from '../../../lib/version.js';
import type { AgentService } from '../../../services/agent-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import type { RoleRegistryService } from '../../../services/role-registry-service.js';

interface StandardHealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  version: string;
  board: {
    totalFeatures: number;
    byStatus: Record<string, number>;
  };
  agents: {
    running: number;
    total: number;
  };
  autoMode: {
    enabled: boolean;
    queueLength?: number;
  };
  registry: {
    templateCount: number;
    roles: string[];
  };
}

export function createStandardHandler(
  agentService: AgentService,
  featureLoader: FeatureLoader,
  autoModeService: AutoModeService,
  roleRegistryService: RoleRegistryService,
  projectPath: string
) {
  return async (_req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      // Get board summary
      const features = await featureLoader.getAll(projectPath);
      const byStatus: Record<string, number> = {};
      for (const feature of features) {
        const status = feature.status || 'unknown';
        byStatus[status] = (byStatus[status] || 0) + 1;
      }

      // Get agent counts
      const sessions = await agentService.listSessions();
      const runningSessions = sessions.filter((s) => {
        // Sessions are running if they have active agent conversations
        // We approximate this by checking if they're not archived
        return !s.archived;
      });

      // Get auto-mode status
      const autoModeStatus = autoModeService.getStatus();

      // Get registry status
      const allTemplates = roleRegistryService.list();
      const roles = [...new Set(allTemplates.map((t) => t.role))];

      const response: StandardHealthResponse = {
        status: 'ok',
        uptime: process.uptime(),
        version: getVersion(),
        board: {
          totalFeatures: features.length,
          byStatus,
        },
        agents: {
          running: runningSessions.length,
          total: sessions.length,
        },
        autoMode: {
          enabled: autoModeStatus.isRunning,
          queueLength: autoModeStatus.runningCount,
        },
        registry: {
          templateCount: allTemplates.length,
          roles,
        },
      };

      const duration = Date.now() - startTime;
      res.setHeader('X-Response-Time', `${duration}ms`);
      res.json(response);
    } catch (error) {
      const duration = Date.now() - startTime;
      res.setHeader('X-Response-Time', `${duration}ms`);
      res.status(503).json({
        status: 'degraded',
        error: error instanceof Error ? error.message : 'Unknown error',
        uptime: process.uptime(),
        version: getVersion(),
      });
    }
  };
}
