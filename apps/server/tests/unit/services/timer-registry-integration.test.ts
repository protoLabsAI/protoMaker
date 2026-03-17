/**
 * Integration test: Timer Registry - interval registration on startup
 *
 * Verifies that SpecGenerationMonitor and PRFeedbackService register their
 * intervals via schedulerService.registerInterval() so that
 * schedulerService.listAll() reflects the timers.
 *
 * Note: HealthMonitorService no longer self-registers — its monitoring is
 * owned by MaintenanceOrchestrator since the M2 consolidation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SchedulerService } from '../../../src/services/scheduler-service.js';
import { SpecGenerationMonitor } from '../../../src/services/spec-generation-monitor.js';
import { PRFeedbackService } from '../../../src/services/pr-feedback-service.js';

// Minimal stub EventEmitter
const makeEvents = () => ({
  emit: vi.fn(),
  subscribe: vi.fn(),
  on: vi.fn(),
});

// Minimal stub FeatureLoader (only methods PRFeedbackService constructor touches)
const makeFeatureLoader = () => ({
  get: vi.fn(),
  setEventEmitter: vi.fn(),
  setIntegrityWatchdog: vi.fn(),
});

describe('Timer Registry: interval registration', () => {
  let scheduler: SchedulerService;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new SchedulerService();
  });

  afterEach(() => {
    scheduler.destroy();
    vi.useRealTimers();
  });

  it('SpecGenerationMonitor registers its interval on startMonitoring()', () => {
    const events = makeEvents();
    const svc = new SpecGenerationMonitor(events as never, {
      checkIntervalMs: 30_000,
      enabled: true,
    });
    svc.setSchedulerService(scheduler);

    svc.startMonitoring();

    const entries = scheduler.listAll();
    const found = entries.find((e) => e.id === 'spec-generation-monitor:check');
    expect(found).toBeDefined();
    expect(found?.type).toBe('interval');

    svc.stopMonitoring();
    expect(
      scheduler.listAll().find((e) => e.id === 'spec-generation-monitor:check')
    ).toBeUndefined();
  });

  it('PRFeedbackService registers its watch interval when addWatch() is called', () => {
    const events = makeEvents();
    const svc = new PRFeedbackService(events as never, makeFeatureLoader() as never, '/tmp/test');
    svc.setSchedulerService(scheduler);

    // addWatch triggers ensureWatchPolling -> registerInterval
    svc.addWatch(42, '/some/project', 'session-1');

    const entries = scheduler.listAll();
    const found = entries.find((e) => e.id === 'pr-watcher:poll');
    expect(found).toBeDefined();
    expect(found?.type).toBe('interval');

    svc.stopWatchPolling();
    expect(scheduler.listAll().find((e) => e.id === 'pr-watcher:poll')).toBeUndefined();
  });

  it('listAll() returns intervals when services are active', () => {
    const events = makeEvents();

    const specSvc = new SpecGenerationMonitor(events as never, { checkIntervalMs: 30_000 });
    specSvc.setSchedulerService(scheduler);
    specSvc.startMonitoring();

    const prSvc = new PRFeedbackService(
      events as never,
      makeFeatureLoader() as never,
      '/tmp/test'
    );
    prSvc.setSchedulerService(scheduler);
    prSvc.addWatch(99, '/project', 'session-x');

    const intervalEntries = scheduler.listAll().filter((e) => e.type === 'interval');
    const ids = intervalEntries.map((e) => e.id);

    expect(ids).toContain('spec-generation-monitor:check');
    expect(ids).toContain('pr-watcher:poll');

    specSvc.stopMonitoring();
    prSvc.stopWatchPolling();
  });
});
