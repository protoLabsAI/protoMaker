/**
 * MaintenanceOrchestrator - Composable scheduled check runner
 *
 * Runs registered MaintenanceCheck modules on two tiers:
 * - critical (every 5 minutes): checks marked tier='critical'
 * - full (every 6 hours): all registered checks
 *
 * Results are aggregated and written to EventHistoryService per project.
 * Events emitted on sweep lifecycle: maintenance:sweep:started, maintenance:sweep:completed.
 */

import { randomUUID } from 'crypto';
import { createLogger } from '@protolabsai/utils';
import type { MaintenanceCheck, MaintenanceSweepResult } from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import type { SchedulerService } from './scheduler-service.js';
import type { EventHistoryService } from './event-history-service.js';

const logger = createLogger('MaintenanceOrchestrator');

const CRITICAL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FULL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

const INTERVAL_ID_CRITICAL = 'maintenance:sweep:critical';
const INTERVAL_ID_FULL = 'maintenance:sweep:full';

/**
 * MaintenanceOrchestrator
 *
 * Wire via maintenance.module.ts. Register check modules before calling start().
 */
export class MaintenanceOrchestrator {
  private readonly checks: MaintenanceCheck[] = [];
  private events: EventEmitter | null = null;
  private eventHistoryService: EventHistoryService | null = null;
  private schedulerService: SchedulerService | null = null;
  private getProjectPaths: (() => string[]) | null = null;
  private isRunning = false;

  /**
   * Register a check module. Must be called before start().
   */
  register(check: MaintenanceCheck): void {
    if (this.checks.some((c) => c.id === check.id)) {
      logger.warn(`Check module '${check.id}' already registered, skipping`);
      return;
    }
    this.checks.push(check);
    logger.info(`Registered maintenance check: ${check.id} (tier=${check.tier})`);
  }

  /**
   * Start the two-tier sweep schedule.
   */
  start(
    schedulerService: SchedulerService,
    events: EventEmitter,
    eventHistoryService: EventHistoryService,
    getProjectPaths: () => string[]
  ): void {
    if (this.isRunning) {
      logger.warn('MaintenanceOrchestrator already running');
      return;
    }

    this.schedulerService = schedulerService;
    this.events = events;
    this.eventHistoryService = eventHistoryService;
    this.getProjectPaths = getProjectPaths;
    this.isRunning = true;

    const criticalChecks = this.checks.filter((c) => c.tier === 'critical');
    const allChecks = this.checks;

    logger.info(
      `Starting MaintenanceOrchestrator: ${criticalChecks.length} critical, ${allChecks.length} total checks`
    );

    // Critical tier: every 5 minutes — critical checks only
    schedulerService.registerInterval(
      INTERVAL_ID_CRITICAL,
      'Maintenance Critical Sweep',
      CRITICAL_INTERVAL_MS,
      () => {
        this.runSweep('critical', criticalChecks).catch((err) =>
          logger.error('Critical maintenance sweep failed:', err)
        );
      }
    );

    // Full tier: every 6 hours — all checks
    schedulerService.registerInterval(
      INTERVAL_ID_FULL,
      'Maintenance Full Sweep',
      FULL_INTERVAL_MS,
      () => {
        this.runSweep('full', allChecks).catch((err) =>
          logger.error('Full maintenance sweep failed:', err)
        );
      }
    );

    // Run a full sweep immediately at startup
    this.runSweep('full', allChecks).catch((err) =>
      logger.error('Initial maintenance sweep failed:', err)
    );
  }

  /**
   * Stop all scheduled sweeps.
   */
  stop(): void {
    if (!this.isRunning || !this.schedulerService) {
      return;
    }

    this.schedulerService.unregisterInterval(INTERVAL_ID_CRITICAL);
    this.schedulerService.unregisterInterval(INTERVAL_ID_FULL);
    this.isRunning = false;
    logger.info('MaintenanceOrchestrator stopped');
  }

  /**
   * Run a sweep synchronously (callable by tests or manual triggers).
   */
  async runSweep(
    tier: 'critical' | 'full',
    checksToRun?: MaintenanceCheck[]
  ): Promise<MaintenanceSweepResult> {
    const checks =
      checksToRun ??
      (tier === 'critical' ? this.checks.filter((c) => c.tier === 'critical') : this.checks);

    const sweepId = `sweep-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const startedAt = new Date().toISOString();
    const projectPaths = this.getProjectPaths?.() ?? [];

    logger.info(
      `Maintenance sweep started: sweepId=${sweepId} tier=${tier} checks=${checks.length} projects=${projectPaths.length}`
    );

    if (this.events) {
      this.events.emit('maintenance:sweep:started', { sweepId, tier, startedAt });
    }

    const results = await Promise.all(
      checks.map(async (check) => {
        const t0 = Date.now();
        try {
          const result = await check.run({ projectPaths });
          return { ...result, checkId: check.id, durationMs: Date.now() - t0 };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          logger.error(`Check '${check.id}' threw:`, err);
          return {
            checkId: check.id,
            passed: false,
            summary: `Check failed with error: ${error}`,
            durationMs: Date.now() - t0,
            error,
          };
        }
      })
    );

    const completedAt = new Date().toISOString();
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    const sweepResult: MaintenanceSweepResult = {
      sweepId,
      tier,
      startedAt,
      completedAt,
      results,
      passed,
      failed,
    };

    logger.info(
      `Maintenance sweep completed: sweepId=${sweepId} passed=${passed} failed=${failed}`
    );

    if (this.events) {
      this.events.emit('maintenance:sweep:completed', sweepResult);
    }

    // Write results to EventHistoryService for each known project
    if (this.eventHistoryService && projectPaths.length > 0) {
      for (const projectPath of projectPaths) {
        this.eventHistoryService
          .storeEvent({
            trigger: 'auto_mode_health_check',
            severity: failed > 0 ? 'high' : 'low',
            projectPath,
            metadata: {
              sweepId,
              tier,
              passed,
              failed,
              results: results.map((r) => ({
                checkId: r.checkId,
                passed: r.passed,
                summary: r.summary,
                durationMs: r.durationMs,
              })),
            },
          })
          .catch((err) =>
            logger.warn(`Failed to store sweep result to event history for ${projectPath}:`, err)
          );
      }
    }

    return sweepResult;
  }
}

// Singleton
let instance: MaintenanceOrchestrator | null = null;

export function getMaintenanceOrchestrator(): MaintenanceOrchestrator {
  if (!instance) {
    instance = new MaintenanceOrchestrator();
  }
  return instance;
}

/** Reset for testing */
export function resetMaintenanceOrchestrator(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
