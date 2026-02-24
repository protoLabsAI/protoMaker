/**
 * Dashboard Routes - System health and status endpoints
 */

import { freemem, totalmem, cpus, loadavg } from 'node:os';
import v8 from 'node:v8';
import { Router, Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { AutoModeService } from '../services/auto-mode-service.js';
import type { LeadEngineerService } from '../services/lead-engineer-service.js';

const logger = createLogger('DashboardRoutes');

export function createDashboardRoutes(
  autoModeService: AutoModeService,
  leadEngineerService?: LeadEngineerService
): Router {
  const router = Router();

  /**
   * POST /api/system/health-dashboard
   * Comprehensive system health with computed percentages for UI gauges.
   */
  router.post('/health-dashboard', async (req: Request, res: Response) => {
    try {
      const memoryUsage = process.memoryUsage();
      const heapStats = v8.getHeapStatistics();
      const totalSystemMem = totalmem();
      const freeSystemMem = freemem();
      const usedSystemMem = totalSystemMem - freeSystemMem;

      // CPU load average (1 min) normalized to 0-100 by core count
      const coreCount = cpus().length || 1;
      const loadAvg = loadavg()[0];
      const cpuPercent = Math.min((loadAvg / coreCount) * 100, 100);

      const autoModeStatus = autoModeService.getStatus();

      // Lead engineer sessions
      const leadEngineerSessions = leadEngineerService
        ? leadEngineerService.getAllSessions().map((s) => ({
            projectPath: s.projectPath,
            projectSlug: s.projectSlug,
            flowState: s.flowState,
            startedAt: s.startedAt,
          }))
        : [];

      res.json({
        success: true,
        memory: {
          rss: memoryUsage.rss,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          systemUsed: usedSystemMem,
          systemTotal: totalSystemMem,
          usedPercent: Math.round((usedSystemMem / totalSystemMem) * 100),
        },
        cpu: {
          loadAvg1m: loadAvg,
          cores: cpus().length,
          loadPercent: Math.round(cpuPercent),
        },
        heap: {
          used: memoryUsage.heapUsed,
          total: heapStats.heap_size_limit,
          percentage: Math.round((memoryUsage.heapUsed / heapStats.heap_size_limit) * 100),
        },
        agents: {
          count: autoModeStatus.runningCount,
          active: autoModeStatus.runningFeatures,
        },
        autoMode: {
          isRunning: autoModeStatus.isRunning,
          runningCount: autoModeStatus.runningCount,
          runningFeatures: autoModeStatus.runningFeatures,
        },
        leadEngineer: {
          running: leadEngineerSessions.length > 0,
          sessionCount: leadEngineerSessions.length,
          sessions: leadEngineerSessions,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get system health:', error);
      res.status(500).json({ error: 'Failed to get system health' });
    }
  });

  return router;
}
