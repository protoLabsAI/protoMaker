/**
 * Unit tests for the AvaChannelReactorService health alert protocol and
 * project_blocked broadcast.
 *
 * Covers:
 * - project_blocked is broadcast when a project reaches 3+ blocked features
 * - project_blocked is NOT broadcast when fewer than 3 features are blocked
 * - health_alert is broadcast when memory > 85% or cpu > 90%
 * - health_alert is NOT broadcast when both are below thresholds
 * - Work-stealing is paused from a peer that sent a health_alert
 * - Pause expires after 5 minutes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { AvaChannelReactorService } from '@/services/ava-channel-reactor-service.js';
import type { ReactorDependencies } from '@/services/ava-channel-reactor-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePostMessage() {
  return vi.fn().mockResolvedValue({ id: `msg-${Math.random()}` });
}

function makeDeps(overrides: Partial<ReactorDependencies> = {}): ReactorDependencies {
  return {
    instanceId: 'local-instance',
    instanceName: 'local',
    avaChannelService: {
      postMessage: makePostMessage(),
    } as unknown as ReactorDependencies['avaChannelService'],
    crdtStore: {
      getOrCreate: vi.fn().mockResolvedValue({ doc: () => ({ messages: [] }) }),
      subscribe: vi.fn(() => vi.fn()),
    } as unknown as ReactorDependencies['crdtStore'],
    settingsService: {
      getGlobalSettings: vi.fn().mockResolvedValue({
        avaChannelReactor: {
          enabled: true,
          cooldownMs: 30_000,
          maxConversationDepth: 5,
          staleMessageThresholdMs: 300_000,
        },
      }),
    },
    autoModeService: {
      getCapacityMetrics: vi.fn().mockReturnValue({
        runningAgents: 0,
        maxAgents: 5,
        backlogCount: 0,
        cpuPercent: 10,
        ramUsagePercent: 50,
      }),
    },
    featureLoader: {
      getAll: vi
        .fn()
        .mockResolvedValue([
          { id: 'feat-1', title: 'Feature 1', status: 'blocked', complexity: 'medium' },
        ]),
      create: vi.fn().mockResolvedValue({ id: 'new-feat-1' }),
    },
    projectPath: '/test/project',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// project_blocked broadcast
// ---------------------------------------------------------------------------

describe('project_blocked — broadcast when 3+ blocked features', () => {
  it('broadcasts project_blocked when project has 3 blocked features', async () => {
    const deps = makeDeps({
      featureLoader: {
        getAll: vi.fn().mockResolvedValue([
          { id: 'feat-1', status: 'blocked' },
          { id: 'feat-2', status: 'blocked' },
          { id: 'feat-3', status: 'blocked' },
          { id: 'feat-4', status: 'in-progress' },
        ]),
        create: vi.fn().mockResolvedValue({ id: 'new' }),
      },
    });
    const reactor = new AvaChannelReactorService(deps);

    await (
      reactor as unknown as { checkAndBroadcastProjectBlocked: () => Promise<void> }
    ).checkAndBroadcastProjectBlocked();

    expect(deps.avaChannelService.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('[project_blocked]'),
      'system',
      expect.objectContaining({ intent: 'escalation' })
    );

    const call = (deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = JSON.parse((call[0] as string).replace('[project_blocked]', '').trim());
    expect(payload.blockedCount).toBe(3);
    expect(payload.projectPath).toBe('/test/project');
    expect(payload.instanceId).toBe('local-instance');
  });

  it('broadcasts project_blocked when project has more than 3 blocked features', async () => {
    const deps = makeDeps({
      featureLoader: {
        getAll: vi.fn().mockResolvedValue([
          { id: 'feat-1', status: 'blocked' },
          { id: 'feat-2', status: 'blocked' },
          { id: 'feat-3', status: 'blocked' },
          { id: 'feat-4', status: 'blocked' },
          { id: 'feat-5', status: 'done' },
        ]),
        create: vi.fn().mockResolvedValue({ id: 'new' }),
      },
    });
    const reactor = new AvaChannelReactorService(deps);

    await (
      reactor as unknown as { checkAndBroadcastProjectBlocked: () => Promise<void> }
    ).checkAndBroadcastProjectBlocked();

    expect(deps.avaChannelService.postMessage).toHaveBeenCalledTimes(1);
    expect(deps.avaChannelService.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('[project_blocked]'),
      'system',
      expect.any(Object)
    );
  });

  it('does NOT broadcast project_blocked when fewer than 3 features are blocked', async () => {
    const deps = makeDeps({
      featureLoader: {
        getAll: vi.fn().mockResolvedValue([
          { id: 'feat-1', status: 'blocked' },
          { id: 'feat-2', status: 'blocked' },
          { id: 'feat-3', status: 'in-progress' },
        ]),
        create: vi.fn().mockResolvedValue({ id: 'new' }),
      },
    });
    const reactor = new AvaChannelReactorService(deps);

    await (
      reactor as unknown as { checkAndBroadcastProjectBlocked: () => Promise<void> }
    ).checkAndBroadcastProjectBlocked();

    expect(deps.avaChannelService.postMessage).not.toHaveBeenCalled();
  });

  it('does NOT broadcast project_blocked when no featureLoader configured', async () => {
    const deps = makeDeps({ featureLoader: undefined });
    const reactor = new AvaChannelReactorService(deps);

    await (
      reactor as unknown as { checkAndBroadcastProjectBlocked: () => Promise<void> }
    ).checkAndBroadcastProjectBlocked();

    expect(deps.avaChannelService.postMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Health alert protocol
// ---------------------------------------------------------------------------

describe('health_alert — broadcast and peer pause', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts health_alert when memory exceeds 85%', async () => {
    const deps = makeDeps({
      autoModeService: {
        getCapacityMetrics: vi.fn().mockReturnValue({
          runningAgents: 2,
          maxAgents: 5,
          backlogCount: 1,
          cpuPercent: 50,
          ramUsagePercent: 90, // above 85%
        }),
      },
    });
    const reactor = new AvaChannelReactorService(deps);

    // Trigger the heartbeat broadcast directly
    await (
      reactor as unknown as { broadcastCapacityHeartbeat: () => Promise<void> }
    ).broadcastCapacityHeartbeat();

    const calls = (deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>).mock.calls;
    const alertCall = calls.find((c: unknown[]) => (c[0] as string).includes('[health_alert]'));
    expect(alertCall).toBeDefined();

    const alertPayload = JSON.parse((alertCall![0] as string).replace('[health_alert]', '').trim());
    expect(alertPayload.memoryUsed).toBe(90);
    expect(alertPayload.instanceId).toBe('local-instance');
  });

  it('broadcasts health_alert when cpu exceeds 90%', async () => {
    const deps = makeDeps({
      autoModeService: {
        getCapacityMetrics: vi.fn().mockReturnValue({
          runningAgents: 2,
          maxAgents: 5,
          backlogCount: 0,
          cpuPercent: 95, // above 90%
          ramUsagePercent: 60,
        }),
      },
    });
    const reactor = new AvaChannelReactorService(deps);

    await (
      reactor as unknown as { broadcastCapacityHeartbeat: () => Promise<void> }
    ).broadcastCapacityHeartbeat();

    const calls = (deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>).mock.calls;
    const alertCall = calls.find((c: unknown[]) => (c[0] as string).includes('[health_alert]'));
    expect(alertCall).toBeDefined();

    const alertPayload = JSON.parse((alertCall![0] as string).replace('[health_alert]', '').trim());
    expect(alertPayload.cpuLoad).toBe(95);
  });

  it('does NOT broadcast health_alert when both metrics are below thresholds', async () => {
    const deps = makeDeps({
      autoModeService: {
        getCapacityMetrics: vi.fn().mockReturnValue({
          runningAgents: 1,
          maxAgents: 5,
          backlogCount: 0,
          cpuPercent: 50,
          ramUsagePercent: 60,
        }),
      },
    });
    const reactor = new AvaChannelReactorService(deps);

    await (
      reactor as unknown as { broadcastCapacityHeartbeat: () => Promise<void> }
    ).broadcastCapacityHeartbeat();

    const calls = (deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>).mock.calls;
    const alertCall = calls.find((c: unknown[]) => (c[0] as string).includes('[health_alert]'));
    expect(alertCall).toBeUndefined();
  });

  it('pauses work-stealing from peer that sent health_alert', async () => {
    const deps = makeDeps();
    const reactor = new AvaChannelReactorService(deps);

    const alertMsg = {
      id: 'msg-alert-1',
      instanceId: 'degraded-peer',
      instanceName: 'degraded-peer',
      content: `[health_alert] ${JSON.stringify({
        instanceId: 'degraded-peer',
        memoryUsed: 92,
        cpuLoad: 85,
        alertTimestamp: new Date().toISOString(),
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (
      reactor as unknown as { handleWorkStealProtocol: (msg: typeof alertMsg) => Promise<void> }
    ).handleWorkStealProtocol(alertMsg);

    const status = reactor.getStatus();
    expect(status.degradedPeerCount).toBe(1);
    expect(status.degradedPeers).toContain('degraded-peer');
  });

  it('work-stealing is skipped for degraded peer', async () => {
    const deps = makeDeps({
      autoModeService: {
        getCapacityMetrics: vi.fn().mockReturnValue({
          runningAgents: 0,
          maxAgents: 5,
          backlogCount: 0,
          cpuPercent: 10,
          ramUsagePercent: 30,
        }),
      },
    });
    const reactor = new AvaChannelReactorService(deps);

    // First: receive a health_alert from the peer
    const alertMsg = {
      id: 'msg-alert-2',
      instanceId: 'degraded-peer',
      instanceName: 'degraded-peer',
      content: `[health_alert] ${JSON.stringify({
        instanceId: 'degraded-peer',
        memoryUsed: 88,
        cpuLoad: 92,
        alertTimestamp: new Date().toISOString(),
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };
    await (
      reactor as unknown as { handleWorkStealProtocol: (msg: typeof alertMsg) => Promise<void> }
    ).handleWorkStealProtocol(alertMsg);

    // Clear postMessage calls from health_alert handler
    (deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>).mockClear();

    // Now receive a capacity_heartbeat from the same degraded peer with backlog
    const heartbeatMsg = {
      id: 'msg-hb-1',
      instanceId: 'degraded-peer',
      instanceName: 'degraded-peer',
      content: `[capacity_heartbeat] ${JSON.stringify({
        instanceId: 'degraded-peer',
        role: 'degraded-peer',
        backlogCount: 5,
        activeCount: 0,
        maxConcurrency: 5,
        cpuLoad: 92,
        memoryUsed: 88,
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };
    await (
      reactor as unknown as { handleWorkStealProtocol: (msg: typeof heartbeatMsg) => Promise<void> }
    ).handleWorkStealProtocol(heartbeatMsg);

    // work_request should NOT have been sent (peer is degraded)
    const workRequestCalls = (
      deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c: unknown[]) => (c[0] as string).includes('[work_request]'));
    expect(workRequestCalls).toHaveLength(0);
  });

  it('pause expires after 5 minutes', async () => {
    const deps = makeDeps();
    const reactor = new AvaChannelReactorService(deps);

    const alertMsg = {
      id: 'msg-alert-3',
      instanceId: 'expiring-peer',
      instanceName: 'expiring-peer',
      content: `[health_alert] ${JSON.stringify({
        instanceId: 'expiring-peer',
        memoryUsed: 90,
        cpuLoad: 50,
        alertTimestamp: new Date().toISOString(),
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (
      reactor as unknown as { handleWorkStealProtocol: (msg: typeof alertMsg) => Promise<void> }
    ).handleWorkStealProtocol(alertMsg);

    expect(reactor.getStatus().degradedPeers).toContain('expiring-peer');

    // Advance timers by 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000 + 100);

    expect(reactor.getStatus().degradedPeers).not.toContain('expiring-peer');
    expect(reactor.getStatus().degradedPeerCount).toBe(0);
  });

  it('ignores health_alert from self', async () => {
    const deps = makeDeps({ instanceId: 'local-instance' });
    const reactor = new AvaChannelReactorService(deps);

    const alertMsg = {
      id: 'msg-self-alert',
      instanceId: 'local-instance',
      instanceName: 'local',
      content: `[health_alert] ${JSON.stringify({
        instanceId: 'local-instance',
        memoryUsed: 90,
        cpuLoad: 50,
        alertTimestamp: new Date().toISOString(),
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (
      reactor as unknown as { handleWorkStealProtocol: (msg: typeof alertMsg) => Promise<void> }
    ).handleWorkStealProtocol(alertMsg);

    expect(reactor.getStatus().degradedPeerCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getStatus() — health fields
// ---------------------------------------------------------------------------

describe('getStatus() — health fields', () => {
  it('reports degradedPeerCount and degradedPeers', () => {
    const deps = makeDeps();
    const reactor = new AvaChannelReactorService(deps);

    const status = reactor.getStatus();
    expect(status.degradedPeerCount).toBe(0);
    expect(status.degradedPeers).toEqual([]);
  });

  it('does not include pendingEscalationCount', () => {
    const deps = makeDeps();
    const reactor = new AvaChannelReactorService(deps);

    const status = reactor.getStatus();
    expect('pendingEscalationCount' in status).toBe(false);
  });
});
