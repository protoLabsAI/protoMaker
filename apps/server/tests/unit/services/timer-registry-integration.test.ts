/**
 * Integration test: Timer Registry - interval registration on startup
 *
 * Verifies that HealthMonitorService, SpecGenerationMonitor, and PRWatcherService
 * register their intervals via schedulerService.registerInterval() so that
 * schedulerService.listAll() reflects all three timers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SchedulerService } from '../../../src/services/scheduler-service.js';
import { HealthMonitorService } from '../../../src/services/health-monitor-service.js';
import { SpecGenerationMonitor } from '../../../src/services/spec-generation-monitor.js';
import { PRWatcherService } from '../../../src/services/pr-watcher-service.js';

// Minimal stub EventEmitter
const makeEvents = () => ({
  emit: vi.fn(),
  subscribe: vi.fn(),
  on: vi.fn(),
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

  it('HealthMonitorService registers its interval on startMonitoring()', () => {
    const events = makeEvents();
    const svc = new HealthMonitorService(undefined, {
      checkIntervalMs: 30_000,
      projectPaths: [],
    });
    svc.setEventEmitter(events as never);
    svc.setSchedulerService(scheduler);

    svc.startMonitoring();

    const entries = scheduler.listAll();
    const found = entries.find((e) => e.id === 'health-monitor:check');
    expect(found).toBeDefined();
    expect(found?.kind).toBe('interval');

    svc.stopMonitoring();
    expect(scheduler.listAll().find((e) => e.id === 'health-monitor:check')).toBeUndefined();
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
    expect(found?.kind).toBe('interval');

    svc.stopMonitoring();
    expect(
      scheduler.listAll().find((e) => e.id === 'spec-generation-monitor:check')
    ).toBeUndefined();
  });

  it('PRWatcherService registers its interval when addWatch() is called', () => {
    const events = makeEvents();
    const svc = new PRWatcherService(events as never, 30_000, 30 * 60_000);
    svc.setSchedulerService(scheduler);

    // addWatch triggers ensurePolling -> registerInterval
    svc.addWatch(42, '/some/project', 'session-1');

    const entries = scheduler.listAll();
    const found = entries.find((e) => e.id === 'pr-watcher:poll');
    expect(found).toBeDefined();
    expect(found?.kind).toBe('interval');

    svc.stopPolling();
    expect(scheduler.listAll().find((e) => e.id === 'pr-watcher:poll')).toBeUndefined();
  });

  it('listAll() returns all three intervals when all services are active', () => {
    const events = makeEvents();

    const healthSvc = new HealthMonitorService(undefined, { checkIntervalMs: 30_000 });
    healthSvc.setEventEmitter(events as never);
    healthSvc.setSchedulerService(scheduler);
    healthSvc.startMonitoring();

    const specSvc = new SpecGenerationMonitor(events as never, { checkIntervalMs: 30_000 });
    specSvc.setSchedulerService(scheduler);
    specSvc.startMonitoring();

    const prSvc = new PRWatcherService(events as never, 30_000, 30 * 60_000);
    prSvc.setSchedulerService(scheduler);
    prSvc.addWatch(99, '/project', 'session-x');

    const intervalEntries = scheduler.listAll().filter((e) => e.kind === 'interval');
    const ids = intervalEntries.map((e) => e.id);

    expect(ids).toContain('health-monitor:check');
    expect(ids).toContain('spec-generation-monitor:check');
    expect(ids).toContain('pr-watcher:poll');

    healthSvc.stopMonitoring();
    specSvc.stopMonitoring();
    prSvc.stopPolling();
  });
});
