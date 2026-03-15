/**
 * Unit tests for MaintenanceOrchestrator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Import after mocks are set up
import { MaintenanceOrchestrator } from '../../src/services/maintenance-orchestrator.js';
import type {
  MaintenanceCheck,
  MaintenanceCheckResult,
  MaintenanceContext,
} from '@protolabsai/types';

function makeCheck(
  id: string,
  tier: MaintenanceCheck['tier'],
  status: MaintenanceCheckResult['status'] = 'pass'
): MaintenanceCheck {
  return {
    id,
    name: `Check ${id}`,
    tier,
    run: vi.fn(
      async (_ctx: MaintenanceContext): Promise<MaintenanceCheckResult> => ({
        checkId: id,
        status,
        durationMs: 10,
      })
    ),
  };
}

function makeSchedulerService() {
  return {
    registerInterval: vi.fn(),
    unregisterInterval: vi.fn(),
  };
}

function makeEventEmitter() {
  return { emit: vi.fn() };
}

describe('MaintenanceOrchestrator', () => {
  let orchestrator: MaintenanceOrchestrator;

  beforeEach(() => {
    orchestrator = new MaintenanceOrchestrator();
  });

  describe('registerCheck', () => {
    it('adds a check', () => {
      const check = makeCheck('test-check', 'critical');
      orchestrator.registerCheck(check);
      expect(orchestrator.listChecks()).toHaveLength(1);
      expect(orchestrator.listChecks()[0].id).toBe('test-check');
    });

    it('ignores duplicate check IDs', () => {
      const check = makeCheck('dup', 'critical');
      orchestrator.registerCheck(check);
      orchestrator.registerCheck(check);
      expect(orchestrator.listChecks()).toHaveLength(1);
    });
  });

  describe('unregisterCheck', () => {
    it('removes a check by ID', () => {
      orchestrator.registerCheck(makeCheck('a', 'critical'));
      orchestrator.registerCheck(makeCheck('b', 'full'));
      orchestrator.unregisterCheck('a');
      expect(orchestrator.listChecks()).toHaveLength(1);
      expect(orchestrator.listChecks()[0].id).toBe('b');
    });

    it('is a no-op for unknown IDs', () => {
      orchestrator.registerCheck(makeCheck('a', 'critical'));
      orchestrator.unregisterCheck('unknown');
      expect(orchestrator.listChecks()).toHaveLength(1);
    });
  });

  describe('start / stop', () => {
    it('registers two intervals with the TimerRegistry on start', () => {
      const scheduler = makeSchedulerService();
      orchestrator.setSchedulerService(scheduler as never);
      orchestrator.start();

      expect(scheduler.registerInterval).toHaveBeenCalledTimes(2);
      const ids = scheduler.registerInterval.mock.calls.map((c) => c[0]);
      expect(ids).toContain('maintenance:critical-sweep');
      expect(ids).toContain('maintenance:full-audit-sweep');
    });

    it('sets isStarted() correctly', () => {
      const scheduler = makeSchedulerService();
      orchestrator.setSchedulerService(scheduler as never);
      expect(orchestrator.isStarted()).toBe(false);
      orchestrator.start();
      expect(orchestrator.isStarted()).toBe(true);
      orchestrator.stop();
      expect(orchestrator.isStarted()).toBe(false);
    });

    it('does not register twice when start() is called again', () => {
      const scheduler = makeSchedulerService();
      orchestrator.setSchedulerService(scheduler as never);
      orchestrator.start();
      orchestrator.start();
      expect(scheduler.registerInterval).toHaveBeenCalledTimes(2);
    });

    it('unregisters both intervals on stop()', () => {
      const scheduler = makeSchedulerService();
      orchestrator.setSchedulerService(scheduler as never);
      orchestrator.start();
      orchestrator.stop();
      expect(scheduler.unregisterInterval).toHaveBeenCalledWith('maintenance:critical-sweep');
      expect(scheduler.unregisterInterval).toHaveBeenCalledWith('maintenance:full-audit-sweep');
    });

    it('does not crash when stop() called before start()', () => {
      expect(() => orchestrator.stop()).not.toThrow();
    });
  });

  describe('runSweep', () => {
    it('runs only critical-tier checks for a critical sweep', async () => {
      const critical = makeCheck('c', 'critical');
      const full = makeCheck('f', 'full');
      orchestrator.registerCheck(critical);
      orchestrator.registerCheck(full);

      const result = await orchestrator.runSweep('critical');
      expect(result.checksRun).toBe(1);
      expect(result.results[0].checkId).toBe('c');
      expect(critical.run).toHaveBeenCalledTimes(1);
      expect(full.run).not.toHaveBeenCalled();
    });

    it('runs all checks for a full sweep', async () => {
      const critical = makeCheck('c', 'critical');
      const full = makeCheck('f', 'full');
      const both = makeCheck('b', ['critical', 'full']);
      orchestrator.registerCheck(critical);
      orchestrator.registerCheck(full);
      orchestrator.registerCheck(both);

      const result = await orchestrator.runSweep('full');
      expect(result.checksRun).toBe(3);
    });

    it('aggregates pass/fail/warn/skip counts', async () => {
      orchestrator.registerCheck(makeCheck('p', 'critical', 'pass'));
      orchestrator.registerCheck(makeCheck('f', 'critical', 'fail'));
      orchestrator.registerCheck(makeCheck('w', 'critical', 'warn'));
      orchestrator.registerCheck(makeCheck('s', 'critical', 'skip'));

      const result = await orchestrator.runSweep('critical');
      expect(result.checksPassed).toBe(1);
      expect(result.checksFailed).toBe(1);
      expect(result.checksWarned).toBe(1);
      expect(result.checksSkipped).toBe(1);
    });

    it('records a fail result when a check throws', async () => {
      const throwing: MaintenanceCheck = {
        id: 'thrower',
        name: 'Throwing Check',
        tier: 'critical',
        run: vi.fn(async () => {
          throw new Error('check exploded');
        }),
      };
      orchestrator.registerCheck(throwing);

      const result = await orchestrator.runSweep('critical');
      expect(result.checksFailed).toBe(1);
      expect(result.results[0].status).toBe('fail');
      expect(result.results[0].message).toBe('check exploded');
    });

    it('includes timing metadata in the sweep result', async () => {
      orchestrator.registerCheck(makeCheck('t', 'critical'));
      const result = await orchestrator.runSweep('critical');
      expect(result.startedAt).toBeTruthy();
      expect(result.completedAt).toBeTruthy();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('emits sweep lifecycle events', async () => {
      const events = makeEventEmitter();
      orchestrator.setEventEmitter(events as never);
      orchestrator.registerCheck(makeCheck('e', 'critical'));

      await orchestrator.runSweep('critical');

      const emittedTypes = events.emit.mock.calls.map((c) => c[0]);
      expect(emittedTypes).toContain('maintenance:sweep:started');
      expect(emittedTypes).toContain('maintenance:check:started');
      expect(emittedTypes).toContain('maintenance:check:completed');
      expect(emittedTypes).toContain('maintenance:sweep:completed');
    });

    it('emits sweep:completed with the full result payload', async () => {
      const events = makeEventEmitter();
      orchestrator.setEventEmitter(events as never);
      orchestrator.registerCheck(makeCheck('x', 'critical'));

      await orchestrator.runSweep('critical');

      const completedCall = events.emit.mock.calls.find(
        (c) => c[0] === 'maintenance:sweep:completed'
      );
      expect(completedCall).toBeDefined();
      expect(completedCall![1]).toHaveProperty('sweepResult');
      expect(completedCall![1].sweepResult.checksRun).toBe(1);
    });
  });
});
