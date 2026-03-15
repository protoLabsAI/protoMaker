/**
 * scheduler-timer-registry.test.ts
 *
 * Unit tests for TimerRegistry additions to SchedulerService:
 * - registerInterval: creates managed setInterval with metadata tracking
 * - listAll: returns unified cron + interval entries
 * - pauseAll / resumeAll: stop and restart all managed timers
 * - getMetrics: aggregated counts and breakdowns
 * - error handling: failure count increments on callback errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchedulerService } from '../../../src/services/scheduler-service.js';

// ── Module-level mocks ────────────────────────────────────────────────────────

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/utils')>('@protolabsai/utils');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

vi.mock('@protolabsai/platform', () => ({
  secureFs: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  },
  getDataDir: vi.fn().mockReturnValue('/tmp/test-data'),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeService(): SchedulerService {
  return new SchedulerService();
}

/** Flush pending microtasks after advancing fake timers */
async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SchedulerService — TimerRegistry', () => {
  let service: SchedulerService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = makeService();
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  // ── registerInterval ────────────────────────────────────────────────────────

  describe('registerInterval', () => {
    it('registers an interval task and starts it immediately', () => {
      const handler = vi.fn();
      service.registerInterval('test-interval', 'Test Interval', 5000, handler);

      const entries = service.listAll();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        id: 'test-interval',
        name: 'Test Interval',
        type: 'interval',
        intervalMs: 5000,
        enabled: true,
        failureCount: 0,
        executionCount: 0,
        category: 'system',
      });
    });

    it('respects the enabled=false option — does not start the timer', () => {
      const handler = vi.fn();
      service.registerInterval('paused-start', 'Paused', 1000, handler, { enabled: false });

      // Advance time — handler should NOT have been called
      vi.advanceTimersByTime(5000);
      expect(handler).not.toHaveBeenCalled();

      const entries = service.listAll();
      expect(entries[0].enabled).toBe(false);
    });

    it('respects the category option', () => {
      service.registerInterval('health-timer', 'Health', 30000, vi.fn(), {
        category: 'health',
      });

      const entries = service.listAll();
      expect(entries[0].category).toBe('health');
    });

    it('ignores duplicate registration for the same id', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      service.registerInterval('dup', 'First', 1000, h1);
      service.registerInterval('dup', 'Second', 2000, h2);

      expect(service.listAll()).toHaveLength(1);
      expect(service.listAll()[0].name).toBe('First');
    });
  });

  // ── tick metadata tracking ──────────────────────────────────────────────────

  describe('interval tick metadata', () => {
    it('records lastRun and increments executionCount on each tick', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      service.registerInterval('tick-meta', 'Tick Meta', 5000, handler);

      vi.advanceTimersToNextTimer();
      await flushPromises();

      const entries = service.listAll();
      expect(entries[0].executionCount).toBe(1);
      expect(entries[0].lastRun).toBeDefined();
    });

    it('records duration on each tick', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      service.registerInterval('duration-meta', 'Duration', 5000, handler);

      vi.advanceTimersToNextTimer();
      await flushPromises();

      const entries = service.listAll();
      expect(typeof entries[0].duration).toBe('number');
    });

    it('increments failureCount when the callback throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('boom'));
      service.registerInterval('fail-interval', 'Failing', 5000, handler);

      vi.advanceTimersToNextTimer();
      await flushPromises();

      const entries = service.listAll();
      expect(entries[0].failureCount).toBe(1);
    });

    it('resets failureCount to 0 after a successful tick following a failure', async () => {
      let callCount = 0;
      const handler = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('first failure');
      });

      service.registerInterval('recover-interval', 'Recover', 5000, handler);

      // First tick — fails
      vi.advanceTimersToNextTimer();
      await flushPromises();

      const afterFail = service.listAll()[0];
      expect(afterFail.failureCount).toBe(1);

      // Second tick — succeeds
      vi.advanceTimersToNextTimer();
      await flushPromises();

      const afterRecover = service.listAll()[0];
      expect(afterRecover.failureCount).toBe(0);
    });
  });

  // ── listAll ─────────────────────────────────────────────────────────────────

  describe('listAll', () => {
    it('returns empty array when nothing is registered', () => {
      expect(service.listAll()).toEqual([]);
    });

    it('returns both cron and interval entries with correct type field', async () => {
      await service.registerTask('cron-task', 'Cron Task', '* * * * *', vi.fn());
      service.registerInterval('int-task', 'Interval Task', 5000, vi.fn());

      const entries = service.listAll();
      expect(entries).toHaveLength(2);

      const cronEntry = entries.find((e) => e.id === 'cron-task');
      const intEntry = entries.find((e) => e.id === 'int-task');

      expect(cronEntry?.type).toBe('cron');
      expect(cronEntry?.expression).toBe('* * * * *');
      expect(intEntry?.type).toBe('interval');
      expect(intEntry?.intervalMs).toBe(5000);
    });
  });

  // ── pauseAll / resumeAll ────────────────────────────────────────────────────

  describe('pauseAll and resumeAll', () => {
    it('pauseAll stops interval tasks from firing', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      service.registerInterval('pausable', 'Pausable', 5000, handler);

      service.pauseAll();

      // Advance time — handler should NOT fire after pause
      vi.advanceTimersByTime(20000);
      await flushPromises();

      expect(handler).not.toHaveBeenCalled();

      const entries = service.listAll();
      expect(entries[0].enabled).toBe(false);
    });

    it('resumeAll restarts interval tasks and they fire again', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      service.registerInterval('resumable', 'Resumable', 5000, handler);

      service.pauseAll();
      service.resumeAll();

      vi.advanceTimersToNextTimer();
      await flushPromises();

      expect(handler).toHaveBeenCalledTimes(1);

      const entries = service.listAll();
      expect(entries[0].enabled).toBe(true);
    });

    it('pauseAll disables cron tasks', async () => {
      await service.registerTask('cron-pause', 'Cron Pause', '* * * * *', vi.fn());

      service.pauseAll();

      const entries = service.listAll();
      const cronEntry = entries.find((e) => e.id === 'cron-pause');
      expect(cronEntry?.enabled).toBe(false);
      expect(cronEntry?.nextRun).toBeUndefined();
    });

    it('resumeAll re-enables cron tasks and recalculates nextRun', async () => {
      await service.registerTask('cron-resume', 'Cron Resume', '* * * * *', vi.fn());

      service.pauseAll();
      service.resumeAll();

      const entries = service.listAll();
      const cronEntry = entries.find((e) => e.id === 'cron-resume');
      expect(cronEntry?.enabled).toBe(true);
      expect(cronEntry?.nextRun).toBeDefined();
    });
  });

  // ── getMetrics ──────────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('returns zero metrics when nothing registered', () => {
      const metrics = service.getMetrics();
      expect(metrics.totalTimers).toBe(0);
      expect(metrics.enabledTimers).toBe(0);
      expect(metrics.pausedTimers).toBe(0);
      expect(metrics.totalExecutions).toBe(0);
      expect(metrics.totalFailures).toBe(0);
    });

    it('counts cron and interval timers separately', async () => {
      await service.registerTask('cron-m', 'Cron', '* * * * *', vi.fn());
      service.registerInterval('int-m', 'Interval', 1000, vi.fn());

      const metrics = service.getMetrics();
      expect(metrics.totalTimers).toBe(2);
      expect(metrics.byType.cron).toBe(1);
      expect(metrics.byType.interval).toBe(1);
    });

    it('reflects paused timers after pauseAll', async () => {
      await service.registerTask('cron-p', 'Cron', '* * * * *', vi.fn());
      service.registerInterval('int-p', 'Interval', 1000, vi.fn());

      service.pauseAll();

      const metrics = service.getMetrics();
      expect(metrics.enabledTimers).toBe(0);
      expect(metrics.pausedTimers).toBe(2);
    });

    it('accumulates totalExecutions and totalFailures from interval tasks', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('fail'));
      service.registerInterval('fail-m', 'Fail', 5000, handler);

      vi.advanceTimersToNextTimer();
      await flushPromises();

      const metrics = service.getMetrics();
      expect(metrics.totalExecutions).toBeGreaterThanOrEqual(1);
      expect(metrics.totalFailures).toBeGreaterThanOrEqual(1);
    });

    it('groups timers by category', () => {
      service.registerInterval('h1', 'Health 1', 1000, vi.fn(), { category: 'health' });
      service.registerInterval('h2', 'Health 2', 1000, vi.fn(), { category: 'health' });
      service.registerInterval('s1', 'Sync 1', 1000, vi.fn(), { category: 'sync' });

      const metrics = service.getMetrics();
      expect(metrics.byCategory.health).toBe(2);
      expect(metrics.byCategory.sync).toBe(1);
    });
  });

  // ── destroy cleanup ─────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('clears all interval task handles on destroy', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      service.registerInterval('d1', 'D1', 5000, handler);

      service.destroy();

      // After destroy, advancing timers should not fire handler
      vi.advanceTimersByTime(20000);
      await flushPromises();

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
