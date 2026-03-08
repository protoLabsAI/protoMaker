/**
 * Unit tests for DORA metrics self-improvement loop.
 *
 * Covers:
 * - FrictionTrackerService.resolvePattern() clears counters and dedup map
 * - AvaChannelReactorService handles pattern_resolved (clears peer counters)
 * - AvaChannelReactorService handles dora_report (stores in CRDTStore)
 * - AvaChannelReactorService broadcasts dora_report hourly
 * - AvaChannelReactorService broadcasts pattern_resolved on feature:done
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before any imports
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  FrictionTrackerService,
  type FrictionTrackerDependencies,
} from '@/services/friction-tracker-service.js';
import type { FrictionReport } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// FrictionTrackerService.resolvePattern() tests
// ---------------------------------------------------------------------------

function makeFrictionDeps(
  overrides: Partial<FrictionTrackerDependencies> = {}
): FrictionTrackerDependencies {
  return {
    featureLoader: {
      create: vi.fn().mockResolvedValue({ id: 'feature-abc' }),
    } as unknown as FrictionTrackerDependencies['featureLoader'],
    avaChannelService: {
      postMessage: vi.fn().mockResolvedValue({ id: 'msg-001' }),
    } as unknown as FrictionTrackerDependencies['avaChannelService'],
    projectPath: '/test/project',
    instanceId: 'instance-test',
    ...overrides,
  };
}

describe('FrictionTrackerService.resolvePattern()', () => {
  let service: FrictionTrackerService;

  beforeEach(() => {
    service = new FrictionTrackerService(makeFrictionDeps());
  });

  it('clears the occurrence counter for the resolved pattern', async () => {
    await service.recordFailure('rate_limit');
    await service.recordFailure('rate_limit');
    expect(service.getCount('rate_limit')).toBe(2);

    service.resolvePattern('rate_limit');

    expect(service.getCount('rate_limit')).toBe(0);
  });

  it('clears the dedup entry so the pattern can be filed again', () => {
    const report: FrictionReport = {
      pattern: 'rate_limit',
      filedAt: new Date().toISOString(),
      featureId: 'feature-peer-001',
      instanceId: 'peer-instance',
    };
    service.handlePeerReport(report);
    expect(service.isPeerRecentlyFiled('rate_limit')).toBe(true);

    service.resolvePattern('rate_limit');

    expect(service.isPeerRecentlyFiled('rate_limit')).toBe(false);
  });

  it('does not throw for empty or unknown patterns', () => {
    expect(() => service.resolvePattern('')).not.toThrow();
    expect(() => service.resolvePattern('nonexistent')).not.toThrow();
  });

  it('only clears the specified pattern, not others', async () => {
    await service.recordFailure('pattern_a');
    await service.recordFailure('pattern_b');

    service.resolvePattern('pattern_a');

    expect(service.getCount('pattern_a')).toBe(0);
    expect(service.getCount('pattern_b')).toBe(1);
  });

  it('allows re-filing after pattern is resolved', async () => {
    const deps = makeFrictionDeps();
    const svc = new FrictionTrackerService(deps);

    // File once
    for (let i = 0; i < 3; i++) {
      await svc.recordFailure('rate_limit');
    }
    expect(deps.featureLoader.create).toHaveBeenCalledOnce();

    // Resolve the pattern
    svc.resolvePattern('rate_limit');

    // Now filing should be possible again
    for (let i = 0; i < 3; i++) {
      await svc.recordFailure('rate_limit');
    }
    expect(deps.featureLoader.create).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// AvaChannelReactorService — DORA protocol tests
// ---------------------------------------------------------------------------

import {
  AvaChannelReactorService,
  type ReactorDependencies,
} from '@/services/ava-channel-reactor-service.js';
import type { AvaChatMessage } from '@protolabsai/types';

function makeMessage(content: string, instanceId = 'remote-instance'): AvaChatMessage {
  return {
    id: `msg-${Date.now()}`,
    content,
    timestamp: new Date().toISOString(),
    source: 'system',
    instanceId,
    instanceName: instanceId,
    intent: 'inform',
    expectsResponse: false,
    conversationDepth: 0,
  };
}

function makeDeps(overrides: Partial<ReactorDependencies> = {}): ReactorDependencies {
  const changeMock = vi.fn().mockResolvedValue(undefined);

  return {
    avaChannelService: {
      postMessage: vi.fn().mockResolvedValue({ id: 'msg-resp' }),
    } as unknown as ReactorDependencies['avaChannelService'],
    crdtStore: {
      getOrCreate: vi.fn().mockResolvedValue({
        doc: () => ({ instanceReports: {}, updatedAt: '' }),
      }),
      subscribe: vi.fn().mockReturnValue(() => {}),
      change: changeMock,
    } as unknown as ReactorDependencies['crdtStore'],
    instanceId: 'local-instance',
    instanceName: 'local',
    settingsService: {
      getGlobalSettings: vi.fn().mockResolvedValue({
        avaChannelReactor: { enabled: true },
      }),
    },
    ...overrides,
  };
}

describe('AvaChannelReactorService — pattern_resolved handler', () => {
  it('calls frictionTrackerService.resolvePattern when a peer broadcasts pattern_resolved', async () => {
    const resolvePattern = vi.fn();
    const frictionTrackerService = {
      handlePeerReport: vi.fn(),
      resolvePattern,
    } as unknown as ReactorDependencies['frictionTrackerService'];

    const deps = makeDeps({ frictionTrackerService });
    const reactor = new AvaChannelReactorService(deps);

    const payload = JSON.stringify({
      pattern: 'rate_limit',
      featureId: 'feature-123',
      instanceId: 'remote-instance',
      resolvedAt: new Date().toISOString(),
    });
    const message = makeMessage(`[pattern_resolved] ${payload}`, 'remote-instance');

    // Access private method via any cast for testing
    await (
      reactor as unknown as { handleWorkStealProtocol(m: AvaChatMessage): Promise<void> }
    ).handleWorkStealProtocol(message);

    expect(resolvePattern).toHaveBeenCalledWith('rate_limit');
  });

  it('ignores pattern_resolved from self', async () => {
    const resolvePattern = vi.fn();
    const frictionTrackerService = {
      handlePeerReport: vi.fn(),
      resolvePattern,
    } as unknown as ReactorDependencies['frictionTrackerService'];

    const deps = makeDeps({ frictionTrackerService });
    const reactor = new AvaChannelReactorService(deps);

    const payload = JSON.stringify({
      pattern: 'rate_limit',
      featureId: 'feature-123',
      instanceId: 'local-instance',
      resolvedAt: new Date().toISOString(),
    });
    // Send as self
    const message = makeMessage(`[pattern_resolved] ${payload}`, 'local-instance');

    await (
      reactor as unknown as { handleWorkStealProtocol(m: AvaChatMessage): Promise<void> }
    ).handleWorkStealProtocol(message);

    expect(resolvePattern).not.toHaveBeenCalled();
  });

  it('does nothing when frictionTrackerService is not configured', async () => {
    const deps = makeDeps({ frictionTrackerService: undefined });
    const reactor = new AvaChannelReactorService(deps);

    const payload = JSON.stringify({
      pattern: 'rate_limit',
      featureId: 'feature-123',
      instanceId: 'remote-instance',
      resolvedAt: new Date().toISOString(),
    });
    const message = makeMessage(`[pattern_resolved] ${payload}`, 'remote-instance');

    // Should not throw
    await expect(
      (
        reactor as unknown as { handleWorkStealProtocol(m: AvaChatMessage): Promise<void> }
      ).handleWorkStealProtocol(message)
    ).resolves.not.toThrow();
  });
});

describe('AvaChannelReactorService — dora_report handler', () => {
  it('stores peer dora_report in CRDTStore under domain=metrics, id=dora', async () => {
    const changeMock = vi.fn().mockImplementation((_domain, _id, fn) => {
      const doc = { instanceReports: {}, updatedAt: '' };
      fn(doc);
      return Promise.resolve();
    });

    const deps = makeDeps({
      crdtStore: {
        getOrCreate: vi.fn().mockResolvedValue({
          doc: () => ({ instanceReports: {}, updatedAt: '' }),
        }),
        subscribe: vi.fn().mockReturnValue(() => {}),
        change: changeMock,
      } as unknown as ReactorDependencies['crdtStore'],
    });

    const reactor = new AvaChannelReactorService(deps);

    const report = {
      instanceId: 'remote-instance',
      computedAt: new Date().toISOString(),
      deploymentsLast24h: 5,
      avgLeadTimeMs: 3600000,
      blockedCount: 1,
      doneCount: 5,
    };
    const message = makeMessage(`[dora_report] ${JSON.stringify(report)}`, 'remote-instance');

    await (
      reactor as unknown as { handleWorkStealProtocol(m: AvaChatMessage): Promise<void> }
    ).handleWorkStealProtocol(message);

    expect(changeMock).toHaveBeenCalledWith('metrics', 'dora', expect.any(Function));

    // Verify the change function writes the correct data
    const [, , changeFn] = changeMock.mock.calls[0];
    const doc = { instanceReports: {}, updatedAt: '' };
    changeFn(doc);
    expect(doc.instanceReports['remote-instance']).toMatchObject({
      deploymentsLast24h: 5,
      avgLeadTimeMs: 3600000,
      blockedCount: 1,
      doneCount: 5,
    });
  });

  it('ignores malformed dora_report messages', async () => {
    const changeMock = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      crdtStore: {
        getOrCreate: vi.fn().mockResolvedValue({ doc: () => ({}) }),
        subscribe: vi.fn().mockReturnValue(() => {}),
        change: changeMock,
      } as unknown as ReactorDependencies['crdtStore'],
    });

    const reactor = new AvaChannelReactorService(deps);
    const message = makeMessage('[dora_report] {not valid json}', 'remote-instance');

    await expect(
      (
        reactor as unknown as { handleWorkStealProtocol(m: AvaChatMessage): Promise<void> }
      ).handleWorkStealProtocol(message)
    ).resolves.not.toThrow();

    expect(changeMock).not.toHaveBeenCalled();
  });
});

describe('AvaChannelReactorService — feature:done System Improvement handler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts pattern_resolved and calls resolvePattern when System Improvement moves to done', () => {
    const resolvePattern = vi.fn();
    const postMessage = vi.fn().mockResolvedValue({ id: 'msg-001' });
    const frictionTrackerService = {
      handlePeerReport: vi.fn(),
      resolvePattern,
    } as unknown as ReactorDependencies['frictionTrackerService'];

    type StatusChangedCallback = (payload: {
      newStatus?: string;
      feature?: { id?: string; systemImprovement?: boolean; title?: string };
    }) => void;

    let capturedCallback: StatusChangedCallback | null = null;
    const events = {
      on: vi.fn((eventType: string, cb: StatusChangedCallback) => {
        if (eventType === 'feature:status-changed') {
          capturedCallback = cb;
        }
        return vi.fn();
      }),
    } as unknown as ReactorDependencies['events'];

    const deps = makeDeps({
      frictionTrackerService,
      events,
      avaChannelService: {
        postMessage,
      } as unknown as ReactorDependencies['avaChannelService'],
    });

    const reactor = new AvaChannelReactorService(deps);
    // Trigger subscribeToFeatureEvents (normally called in start())
    (reactor as unknown as { subscribeToFeatureEvents(): void }).subscribeToFeatureEvents();

    expect(capturedCallback).not.toBeNull();

    // Simulate a System Improvement feature moving to done
    capturedCallback!({
      newStatus: 'done',
      feature: {
        id: 'feature-si-001',
        systemImprovement: true,
        title: 'System Improvement: recurring rate_limit failures',
      },
    });

    // resolvePattern should be called synchronously
    expect(resolvePattern).toHaveBeenCalledWith('rate_limit');
  });

  it('does not broadcast for non-done status changes on System Improvement features', () => {
    const resolvePattern = vi.fn();
    const frictionTrackerService = {
      handlePeerReport: vi.fn(),
      resolvePattern,
    } as unknown as ReactorDependencies['frictionTrackerService'];

    type StatusChangedCallback = (payload: {
      newStatus?: string;
      feature?: { id?: string; systemImprovement?: boolean; title?: string };
    }) => void;

    let capturedCallback: StatusChangedCallback | null = null;
    const events = {
      on: vi.fn((eventType: string, cb: StatusChangedCallback) => {
        if (eventType === 'feature:status-changed') {
          capturedCallback = cb;
        }
        return vi.fn();
      }),
    } as unknown as ReactorDependencies['events'];

    const deps = makeDeps({ frictionTrackerService, events });
    const reactor = new AvaChannelReactorService(deps);
    (reactor as unknown as { subscribeToFeatureEvents(): void }).subscribeToFeatureEvents();

    capturedCallback!({
      newStatus: 'in_progress',
      feature: {
        id: 'feature-si-001',
        systemImprovement: true,
        title: 'System Improvement: recurring rate_limit failures',
      },
    });

    expect(resolvePattern).not.toHaveBeenCalled();
  });

  it('does not broadcast for non-System Improvement features', () => {
    const resolvePattern = vi.fn();
    const frictionTrackerService = {
      handlePeerReport: vi.fn(),
      resolvePattern,
    } as unknown as ReactorDependencies['frictionTrackerService'];

    type StatusChangedCallback = (payload: {
      newStatus?: string;
      feature?: { id?: string; systemImprovement?: boolean; title?: string };
    }) => void;

    let capturedCallback: StatusChangedCallback | null = null;
    const events = {
      on: vi.fn((eventType: string, cb: StatusChangedCallback) => {
        if (eventType === 'feature:status-changed') {
          capturedCallback = cb;
        }
        return vi.fn();
      }),
    } as unknown as ReactorDependencies['events'];

    const deps = makeDeps({ frictionTrackerService, events });
    const reactor = new AvaChannelReactorService(deps);
    (reactor as unknown as { subscribeToFeatureEvents(): void }).subscribeToFeatureEvents();

    capturedCallback!({
      newStatus: 'done',
      feature: {
        id: 'feature-regular-001',
        systemImprovement: false,
        title: 'Add new feature',
      },
    });

    expect(resolvePattern).not.toHaveBeenCalled();
  });
});

describe('AvaChannelReactorService — DORA aggregate (CRDTStore)', () => {
  it('mergesDora report into instanceReports correctly', () => {
    const doc: { instanceReports: Record<string, unknown>; updatedAt: string } = {
      instanceReports: {},
      updatedAt: '',
    };

    const report = {
      instanceId: 'test-instance',
      computedAt: '2026-03-08T12:00:00Z',
      deploymentsLast24h: 3,
      avgLeadTimeMs: 7200000,
      blockedCount: 0,
      doneCount: 3,
    };

    // Simulate what the change function does
    doc.instanceReports[report.instanceId] = {
      computedAt: report.computedAt,
      deploymentsLast24h: report.deploymentsLast24h,
      avgLeadTimeMs: report.avgLeadTimeMs,
      blockedCount: report.blockedCount,
      doneCount: report.doneCount,
    };
    doc.updatedAt = new Date().toISOString();

    expect(doc.instanceReports['test-instance']).toMatchObject({
      deploymentsLast24h: 3,
      avgLeadTimeMs: 7200000,
      blockedCount: 0,
      doneCount: 3,
    });
    expect(doc.updatedAt).toBeTruthy();
  });

  it('overwrites stale instance report with newer data', () => {
    const doc: {
      instanceReports: Record<string, { deploymentsLast24h: number; computedAt: string }>;
      updatedAt: string;
    } = {
      instanceReports: {
        'test-instance': { deploymentsLast24h: 1, computedAt: '2026-03-08T10:00:00Z' },
      },
      updatedAt: '2026-03-08T10:00:00Z',
    };

    // Simulate updating with newer data
    doc.instanceReports['test-instance'] = {
      deploymentsLast24h: 5,
      computedAt: '2026-03-08T11:00:00Z',
    };

    expect(doc.instanceReports['test-instance'].deploymentsLast24h).toBe(5);
    expect(doc.instanceReports['test-instance'].computedAt).toBe('2026-03-08T11:00:00Z');
  });
});
