/**
 * QA Check Aggregation Route
 *
 * Single endpoint that consolidates multiple data sources into a unified QA report.
 * Fans out to existing services in parallel via Promise.allSettled so one failure
 * does not break the entire report. Designed for consumption by the Quinn QA agent.
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@protolabsai/utils';
import type { ServiceContainer } from '../../server/services.js';
import { getVersion } from '../../lib/version.js';

const logger = createLogger('QaRoute');

interface HealthSnapshot {
  status: string;
  version: string;
  uptimeMs: number;
  memoryUsageMb: number;
}

export function createQaRoutes(services: ServiceContainer): Router {
  const {
    featureLoader,
    schedulerService,
    deploymentTrackerService,
    doraMetricsService,
    actionableItemService,
  } = services;

  const router = Router();

  /**
   * GET /api/qa/check?projectPath=/path/to/project
   *
   * Returns a consolidated QA snapshot covering server health, service wiring,
   * scheduler timers, deployments, DORA metrics, board state, and pending signals.
   */
  router.get('/check', async (req: Request, res: Response) => {
    const projectPath = String(req.query.projectPath ?? '');
    if (!projectPath) {
      res.status(400).json({ success: false, error: 'projectPath query parameter is required' });
      return;
    }

    try {
      const [
        healthResult,
        wiringResult,
        timersResult,
        deploymentsResult,
        doraResult,
        boardResult,
        signalsResult,
      ] = await Promise.allSettled([
        gatherHealth(),
        gatherWiring(services),
        gatherTimers(schedulerService),
        gatherDeployments(deploymentTrackerService),
        gatherDora(doraMetricsService, projectPath),
        gatherBoard(featureLoader, projectPath),
        gatherSignals(actionableItemService, projectPath),
      ]);

      res.json({
        success: true,
        report: {
          timestamp: new Date().toISOString(),
          projectPath,
          health: unwrap(healthResult, defaultHealth()),
          wiring: unwrap(wiringResult, { totalServices: 0, services: [] }),
          timers: unwrap(timersResult, defaultTimers()),
          deployments: unwrap(deploymentsResult, defaultDeployments()),
          dora: unwrap(doraResult, null),
          board: unwrap(boardResult, defaultBoard()),
          signals: unwrap(signalsResult, defaultSignals()),
        },
      });
    } catch (err) {
      logger.error('QA check failed:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to generate QA report',
      });
    }
  });

  return router;
}

// ── Gatherers ────────────────────────────────────────────

function gatherHealth(): Promise<HealthSnapshot> {
  const mem = process.memoryUsage();
  return Promise.resolve({
    status: 'ok',
    version: getVersion(),
    uptimeMs: Math.floor(process.uptime() * 1000),
    memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
  });
}

function gatherWiring(services: ServiceContainer) {
  // Check key services for non-null instantiation
  const checks: Array<{ name: string; ref: unknown }> = [
    { name: 'featureLoader', ref: services.featureLoader },
    { name: 'autoModeService', ref: services.autoModeService },
    { name: 'schedulerService', ref: services.schedulerService },
    { name: 'leadEngineerService', ref: services.leadEngineerService },
    { name: 'deploymentTrackerService', ref: services.deploymentTrackerService },
    { name: 'doraMetricsService', ref: services.doraMetricsService },
    { name: 'actionableItemService', ref: services.actionableItemService },
    { name: 'signalIntakeService', ref: services.signalIntakeService },
    { name: 'eventRouterService', ref: services.eventRouterService },
    { name: 'prFeedbackService', ref: services.prFeedbackService },
    { name: 'completionDetectorService', ref: services.completionDetectorService },
    { name: 'reconciliationService', ref: services.reconciliationService },
    { name: 'healthMonitorService', ref: services.healthMonitorService },
    { name: 'maintenanceOrchestrator', ref: services.maintenanceOrchestrator },
    { name: 'discordBotService', ref: services.discordBotService },
    { name: 'escalationRouter', ref: services.escalationRouter },
    { name: 'authorityService', ref: services.authorityService },
    { name: 'ceremonyService', ref: services.ceremonyService },
    { name: 'projectService', ref: services.projectService },
    { name: 'gitWorkflowService', ref: services.gitWorkflowService },
  ];

  const serviceEntries = checks.map((c) => ({
    name: c.name,
    wired: c.ref != null,
  }));

  return Promise.resolve({
    totalServices: serviceEntries.length,
    services: serviceEntries,
  });
}

function gatherTimers(schedulerService: ServiceContainer['schedulerService']) {
  const allTimers = schedulerService.listAll();
  const running = allTimers.filter((t) => t.enabled).length;
  const paused = allTimers.length - running;

  const signalTimers = allTimers
    .filter((t) => t.id.includes('signal') || t.name.toLowerCase().includes('signal'))
    .map((t) => t.id);

  const healthTimers = allTimers
    .filter(
      (t) =>
        t.category === 'health' ||
        t.id.includes('health') ||
        t.name.toLowerCase().includes('health')
    )
    .map((t) => t.id);

  return Promise.resolve({
    total: allTimers.length,
    running,
    paused,
    signalTimers,
    healthTimers,
  });
}

function gatherDeployments(deploymentTracker: ServiceContainer['deploymentTrackerService']) {
  const stats = deploymentTracker.getStats(30);
  const sevenDayStats = deploymentTracker.getStats(7);
  const latest = deploymentTracker.getLatest();

  return Promise.resolve({
    total: stats.total,
    recentCount: sevenDayStats.total,
    successRate: stats.successRate,
    lastDeploy: latest
      ? {
          environment: latest.environment,
          status: latest.status,
          timestamp: latest.completedAt ?? latest.startedAt,
        }
      : null,
  });
}

async function gatherDora(
  doraMetricsService: ServiceContainer['doraMetricsService'],
  projectPath: string
) {
  const metrics = await doraMetricsService.getMetrics(projectPath);
  return {
    deploymentFrequency: metrics.deploymentFrequency.value,
    changeFailureRate: metrics.changeFailureRate.value,
    leadTime: metrics.leadTime.value,
    recoveryTime: metrics.recoveryTime.value,
  };
}

async function gatherBoard(featureLoader: ServiceContainer['featureLoader'], projectPath: string) {
  const features = await featureLoader.getAll(projectPath);
  const board = {
    total: features.length,
    backlog: 0,
    inProgress: 0,
    review: 0,
    blocked: 0,
    done: 0,
  };

  for (const f of features) {
    const status = f.status as string;
    if (status === 'backlog') board.backlog++;
    else if (status === 'in_progress') board.inProgress++;
    else if (status === 'review') board.review++;
    else if (status === 'blocked') board.blocked++;
    else if (status === 'done' || status === 'verified') board.done++;
  }

  return board;
}

async function gatherSignals(
  actionableItemService: ServiceContainer['actionableItemService'],
  projectPath: string
) {
  const items = await actionableItemService.getActionableItems(projectPath);
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'snoozed');

  return {
    totalPending: pending.length,
    exceptions: pending.filter((i) => i.actionType === 'escalation').length,
    decisions: pending.filter((i) => i.actionType === 'approval' || i.actionType === 'gate').length,
    signalItems: pending.filter((i) => i.actionType === 'signal').length,
  };
}

// ── Helpers ──────────────────────────────────────────────

/** Unwrap a settled promise, falling back to a default on rejection */
function unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
  if (result.status === 'fulfilled') return result.value;
  logger.warn('QA gatherer failed:', result.reason);
  return fallback;
}

function defaultHealth() {
  return {
    status: 'degraded' as const,
    version: '0.0.0',
    uptimeMs: 0,
    memoryUsageMb: 0,
  };
}

function defaultTimers() {
  return {
    total: 0,
    running: 0,
    paused: 0,
    signalTimers: [] as string[],
    healthTimers: [] as string[],
  };
}

function defaultDeployments() {
  return {
    total: 0,
    recentCount: 0,
    successRate: 0,
    lastDeploy: null,
  };
}

function defaultBoard() {
  return {
    total: 0,
    backlog: 0,
    inProgress: 0,
    review: 0,
    blocked: 0,
    done: 0,
  };
}

function defaultSignals() {
  return {
    totalPending: 0,
    exceptions: 0,
    decisions: 0,
    signalItems: 0,
  };
}
