/**
 * Maintenance Orchestrator
 *
 * Runs composable MaintenanceCheck modules on a two-tier schedule:
 *   - critical tier: every 5 minutes
 *   - full tier:     every 6 hours
 *
 * Checks register themselves via `registerCheck()`. The orchestrator
 * executes them in sequence, aggregates timing + status, and emits
 * lifecycle events so listeners can react to sweep outcomes.
 */

import { createLogger } from '@protolabsai/utils';
import type {
  MaintenanceCheck,
  MaintenanceCheckResult,
  MaintenanceContext,
  MaintenanceSweepResult,
  MaintenanceTier,
} from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import type { SchedulerService } from './scheduler-service.js';

const logger = createLogger('MaintenanceOrchestrator');

/** Interval ID registered with the TimerRegistry for the critical tier */
const CRITICAL_INTERVAL_ID = 'maintenance:critical-sweep';
/** Interval ID registered with the TimerRegistry for the full-audit tier */
const FULL_INTERVAL_ID = 'maintenance:full-audit-sweep';

/** 5 minutes in milliseconds */
const CRITICAL_INTERVAL_MS = 5 * 60 * 1000;
/** 6 hours in milliseconds */
const FULL_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class MaintenanceOrchestrator {
  private readonly checks: MaintenanceCheck[] = [];
  private events: EventEmitter | null = null;
  private schedulerService: SchedulerService | null = null;
  private isRunning = false;

  /** Register a check module. Idempotent — duplicate IDs are ignored. */
  registerCheck(check: MaintenanceCheck): void {
    if (this.checks.some((c) => c.id === check.id)) {
      logger.warn(`MaintenanceCheck '${check.id}' already registered — skipping`);
      return;
    }
    this.checks.push(check);
    logger.info(`Registered maintenance check: ${check.id} (${check.name})`);
  }

  /** Remove a previously registered check by ID. */
  unregisterCheck(checkId: string): void {
    const idx = this.checks.findIndex((c) => c.id === checkId);
    if (idx !== -1) {
      this.checks.splice(idx, 1);
      logger.info(`Unregistered maintenance check: ${checkId}`);
    }
  }

  /** Return all currently registered checks. */
  listChecks(): ReadonlyArray<MaintenanceCheck> {
    return this.checks;
  }

  /** Inject the event emitter used to broadcast sweep lifecycle events. */
  setEventEmitter(events: EventEmitter): void {
    this.events = events;
  }

  /**
   * Inject the scheduler service (TimerRegistry).
   * Must be called before `start()` for intervals to appear in the registry.
   */
  setSchedulerService(schedulerService: SchedulerService): void {
    this.schedulerService = schedulerService;
  }

  /**
   * Start the two-tier sweep schedule.
   *
   * Registers the critical (5 min) and full-audit (6 h) intervals with the
   * scheduler service / TimerRegistry so they appear in `schedulerService.listAll()`
   * and can be inspected centrally.
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('MaintenanceOrchestrator is already running');
      return;
    }

    if (!this.schedulerService) {
      logger.error('Cannot start MaintenanceOrchestrator: schedulerService not set');
      return;
    }

    this.schedulerService.registerInterval(
      CRITICAL_INTERVAL_ID,
      'Maintenance Critical Sweep (5min)',
      CRITICAL_INTERVAL_MS,
      () => {
        this.runSweep('critical').catch((err) => {
          logger.error('Critical maintenance sweep failed:', err);
        });
      }
    );

    this.schedulerService.registerInterval(
      FULL_INTERVAL_ID,
      'Maintenance Full Audit (6h)',
      FULL_INTERVAL_MS,
      () => {
        this.runSweep('full').catch((err) => {
          logger.error('Full maintenance audit sweep failed:', err);
        });
      }
    );

    this.isRunning = true;
    logger.info(
      `MaintenanceOrchestrator started — critical: ${CRITICAL_INTERVAL_MS}ms, full: ${FULL_INTERVAL_MS}ms`
    );
  }

  /** Stop both sweep intervals and deregister from the TimerRegistry. */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.schedulerService) {
      this.schedulerService.unregisterInterval(CRITICAL_INTERVAL_ID);
      this.schedulerService.unregisterInterval(FULL_INTERVAL_ID);
    }

    this.isRunning = false;
    logger.info('MaintenanceOrchestrator stopped');
  }

  /** Whether the orchestrator has been started and not yet stopped. */
  isStarted(): boolean {
    return this.isRunning;
  }

  /**
   * Execute all checks that participate in the given tier, in registration order.
   * Results are aggregated and returned as a `MaintenanceSweepResult`.
   */
  async runSweep(tier: MaintenanceTier): Promise<MaintenanceSweepResult> {
    const startedAt = new Date().toISOString();
    const sweepStart = Date.now();

    const context: MaintenanceContext = { tier, startedAt };

    this.events?.emit('maintenance:sweep:started', { tier, startedAt });
    logger.info(`Starting maintenance sweep — tier: ${tier}`);

    const eligibleChecks = this.checks.filter((c) => {
      const tiers = Array.isArray(c.tier) ? c.tier : [c.tier];
      return tier === 'full' ? true : tiers.includes(tier);
    });

    const results: MaintenanceCheckResult[] = [];
    let passed = 0;
    let failed = 0;
    let warned = 0;
    let skipped = 0;

    for (const check of eligibleChecks) {
      this.events?.emit('maintenance:check:started', { checkId: check.id, tier });

      const checkStart = Date.now();
      let result: MaintenanceCheckResult;

      try {
        result = await check.run(context);
        result.durationMs = result.durationMs ?? Date.now() - checkStart;
      } catch (err) {
        const durationMs = Date.now() - checkStart;
        logger.error(`Check '${check.id}' threw an unhandled error:`, err);
        result = {
          checkId: check.id,
          status: 'fail',
          message: err instanceof Error ? err.message : String(err),
          durationMs,
        };
        this.events?.emit('maintenance:check:failed', { checkId: check.id, tier, err });
      }

      switch (result.status) {
        case 'pass':
          passed++;
          break;
        case 'fail':
          failed++;
          break;
        case 'warn':
          warned++;
          break;
        case 'skip':
          skipped++;
          break;
      }

      this.events?.emit('maintenance:check:completed', { checkId: check.id, tier, result });
      results.push(result);

      logger.debug(
        `Check '${check.id}' completed — status: ${result.status} (${result.durationMs}ms)`
      );
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - sweepStart;

    const sweepResult: MaintenanceSweepResult = {
      tier,
      startedAt,
      completedAt,
      durationMs,
      checksRun: eligibleChecks.length,
      checksPassed: passed,
      checksFailed: failed,
      checksWarned: warned,
      checksSkipped: skipped,
      results,
    };

    this.events?.emit('maintenance:sweep:completed', { tier, sweepResult });

    logger.info(
      `Maintenance sweep completed — tier: ${tier}, run: ${sweepResult.checksRun}, ` +
        `pass: ${passed}, fail: ${failed}, warn: ${warned}, skip: ${skipped}, ` +
        `duration: ${durationMs}ms`
    );

    return sweepResult;
  }
}

let _orchestrator: MaintenanceOrchestrator | null = null;

/** Return the singleton MaintenanceOrchestrator instance. */
export function getMaintenanceOrchestrator(): MaintenanceOrchestrator {
  if (!_orchestrator) {
    _orchestrator = new MaintenanceOrchestrator();
  }
  return _orchestrator;
}
