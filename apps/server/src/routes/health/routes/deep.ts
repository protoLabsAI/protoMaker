/**
 * GET /deep endpoint - Deep health check (<2s target, 10s timeout)
 * Returns comprehensive diagnostics: probes agents, world state, full system status
 * Timeout protection ensures response even if checks are slow
 */

import type { Request, Response } from 'express';
import { getVersion } from '../../../lib/version.js';
import type { AgentService } from '../../../services/agent-service.js';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type { AutoModeService } from '../../../services/auto-mode-service.js';

interface DeepHealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  uptime: number;
  version: string;
  board: {
    totalFeatures: number;
    byStatus: Record<string, number>;
    features: Array<{
      id: string;
      title: string;
      status: string;
      branchName?: string;
    }>;
  };
  agents: {
    running: number;
    total: number;
    sessions: Array<{
      id: string;
      name: string;
      workingDirectory: string;
      model?: string;
      createdAt: string;
    }>;
  };
  autoMode: {
    enabled: boolean;
    queueLength: number;
    queue: Array<{
      featureId: string;
      title: string;
    }>;
  };
  performance: {
    responseTime: number;
    timedOut: boolean;
  };
}

const DEEP_CHECK_TIMEOUT = 10000; // 10s timeout
const TARGET_TIME = 2000; // 2s target

export function createDeepHandler(
  agentService: AgentService,
  featureLoader: FeatureLoader,
  autoModeService: AutoModeService,
  projectPath: string
) {
  return async (_req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    let timedOut = false;

    // Set up timeout protection
    const timeoutId = setTimeout(() => {
      timedOut = true;
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check timed out',
        uptime: process.uptime(),
        version: getVersion(),
        performance: {
          responseTime: Date.now() - startTime,
          timedOut: true,
        },
      });
    }, DEEP_CHECK_TIMEOUT);

    try {
      // Get comprehensive board data
      const features = await featureLoader.getAll(projectPath);
      const byStatus: Record<string, number> = {};
      for (const feature of features) {
        const status = feature.status || 'unknown';
        byStatus[status] = (byStatus[status] || 0) + 1;
      }

      // Get detailed agent information
      const sessions = await agentService.listSessions();

      // Get auto-mode full status (Note: getRunningAgents would be better but this is simpler)
      const autoModeStatus = autoModeService.getStatus();

      const duration = Date.now() - startTime;

      // Determine overall health status
      let status: 'ok' | 'degraded' | 'unhealthy' = 'ok';
      if (duration > TARGET_TIME) {
        status = 'degraded';
      }
      if (timedOut) {
        status = 'unhealthy';
      }

      const response: DeepHealthResponse = {
        status,
        uptime: process.uptime(),
        version: getVersion(),
        board: {
          totalFeatures: features.length,
          byStatus,
          features: features.map((f) => ({
            id: f.id,
            title: f.title || 'Untitled',
            status: f.status || 'unknown',
            branchName: f.branchName,
          })),
        },
        agents: {
          running: sessions.filter((s) => !s.archived).length,
          total: sessions.length,
          sessions: sessions.map((s) => ({
            id: s.id,
            name: s.name,
            workingDirectory: s.workingDirectory,
            model: s.model,
            createdAt: s.createdAt,
          })),
        },
        autoMode: {
          enabled: autoModeStatus.isRunning,
          queueLength: autoModeStatus.runningCount,
          queue: autoModeStatus.runningFeatures.map((featureId) => ({
            featureId,
            title: features.find((f) => f.id === featureId)?.title || 'Unknown',
          })),
        },
        performance: {
          responseTime: duration,
          timedOut: false,
        },
      };

      clearTimeout(timeoutId);

      if (!timedOut) {
        res.setHeader('X-Response-Time', `${duration}ms`);
        res.json(response);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (!timedOut) {
        const duration = Date.now() - startTime;
        res.setHeader('X-Response-Time', `${duration}ms`);
        res.status(503).json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          uptime: process.uptime(),
          version: getVersion(),
          performance: {
            responseTime: duration,
            timedOut: false,
          },
        });
      }
    }
  };
}
