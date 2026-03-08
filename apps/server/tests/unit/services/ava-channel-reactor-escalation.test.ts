/**
 * Unit tests for the AvaChannelReactorService escalation handshake and health alert protocol.
 *
 * Covers:
 * - escalation_request is posted when failureCount >= 2
 * - escalation_request is NOT posted when failureCount < 2
 * - Peer responds with escalation_offer within one tick when it has idle capacity
 * - Peer does NOT respond with escalation_offer when at capacity
 * - Originator accepts the first escalation_offer with escalation_accept
 * - Originator ignores duplicate escalation_offers for the same feature
 * - Accepting instance creates feature with escalated complexity on escalation_accept
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
        avaChannelReactor: { enabled: true, cooldownMs: 30_000, maxConversationDepth: 5, staleMessageThresholdMs: 300_000 },
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
      getAll: vi.fn().mockResolvedValue([
        { id: 'feat-1', title: 'Feature 1', status: 'blocked', complexity: 'medium' },
      ]),
      create: vi.fn().mockResolvedValue({ id: 'new-feat-1' }),
    },
    projectPath: '/test/project',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Escalation request posting
// ---------------------------------------------------------------------------

describe('postEscalationRequest()', () => {
  it('posts escalation_request when failureCount >= 2', async () => {
    const deps = makeDeps();
    const reactor = new AvaChannelReactorService(deps);

    await reactor.postEscalationRequest({
      featureId: 'feat-1',
      failureCount: 2,
      lastError: 'Agent timed out',
      worktreeState: 'dirty',
      featureData: { title: 'Feature 1' },
    });

    expect(deps.avaChannelService.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('[escalation_request]'),
      'system',
      expect.objectContaining({ intent: 'escalation', expectsResponse: true })
    );
  });

  it('posts escalation_request when failureCount > 2', async () => {
    const deps = makeDeps();
    const reactor = new AvaChannelReactorService(deps);

    await reactor.postEscalationRequest({
      featureId: 'feat-1',
      failureCount: 5,
      lastError: 'Repeated failure',
      worktreeState: 'clean',
      featureData: {},
    });

    expect(deps.avaChannelService.postMessage).toHaveBeenCalledTimes(1);
  });

  it('does NOT post escalation_request when failureCount < 2', async () => {
    const deps = makeDeps();
    const reactor = new AvaChannelReactorService(deps);

    await reactor.postEscalationRequest({
      featureId: 'feat-1',
      failureCount: 1,
      lastError: 'Single failure',
      worktreeState: 'clean',
      featureData: {},
    });

    expect(deps.avaChannelService.postMessage).not.toHaveBeenCalled();
  });

  it('includes featureId in context', async () => {
    const deps = makeDeps();
    const reactor = new AvaChannelReactorService(deps);

    await reactor.postEscalationRequest({
      featureId: 'feat-xyz',
      failureCount: 3,
      lastError: 'Crash',
      worktreeState: 'dirty',
      featureData: { id: 'feat-xyz', title: 'XYZ' },
    });

    expect(deps.avaChannelService.postMessage).toHaveBeenCalledWith(
      expect.any(String),
      'system',
      expect.objectContaining({ context: { featureId: 'feat-xyz' } })
    );
  });
});

// ---------------------------------------------------------------------------
// Escalation offer — peer responds within one reactor tick
// ---------------------------------------------------------------------------

describe('escalation_offer — peer responds to escalation_request', () => {
  it('sends escalation_offer when peer has idle capacity', async () => {
    const deps = makeDeps({
      instanceId: 'peer-instance',
      autoModeService: {
        getCapacityMetrics: vi.fn().mockReturnValue({
          runningAgents: 2,
          maxAgents: 5,
          backlogCount: 0,
          cpuPercent: 10,
          ramUsagePercent: 30,
        }),
      },
    });
    const reactor = new AvaChannelReactorService(deps);

    // Simulate receiving an escalation_request from a remote instance
    const escalationMsg = {
      id: 'msg-esc-1',
      instanceId: 'remote-instance',
      instanceName: 'remote',
      content: `[escalation_request] ${JSON.stringify({
        featureId: 'feat-1',
        failureCount: 2,
        lastError: 'Agent timed out',
        worktreeState: 'dirty',
        originatingInstanceId: 'remote-instance',
        featureData: { title: 'Feature 1' },
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    // Directly invoke the internal handler via handleWorkStealProtocol-like path
    // by feeding a CRDT shard change that includes the message
    const mockDoc = {
      messages: [escalationMsg],
    };
    // Access private method via casting
    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof escalationMsg) => Promise<void> }).handleWorkStealProtocol(escalationMsg);

    expect(deps.avaChannelService.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('[escalation_offer]'),
      'system',
      expect.objectContaining({ intent: 'response' })
    );

    const callArg = (deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const payload = JSON.parse(callArg.replace('[escalation_offer]', '').trim());
    expect(payload.featureId).toBe('feat-1');
    expect(payload.originatingInstanceId).toBe('remote-instance');
    expect(payload.offeringInstanceId).toBe('peer-instance');
  });

  it('does NOT send escalation_offer when peer is at capacity', async () => {
    const deps = makeDeps({
      instanceId: 'peer-instance',
      autoModeService: {
        getCapacityMetrics: vi.fn().mockReturnValue({
          runningAgents: 5,
          maxAgents: 5,
          backlogCount: 2,
          cpuPercent: 80,
          ramUsagePercent: 70,
        }),
      },
    });
    const reactor = new AvaChannelReactorService(deps);

    const escalationMsg = {
      id: 'msg-esc-2',
      instanceId: 'remote-instance',
      instanceName: 'remote',
      content: `[escalation_request] ${JSON.stringify({
        featureId: 'feat-2',
        failureCount: 3,
        lastError: 'Crash',
        worktreeState: 'clean',
        originatingInstanceId: 'remote-instance',
        featureData: {},
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof escalationMsg) => Promise<void> }).handleWorkStealProtocol(escalationMsg);

    expect(deps.avaChannelService.postMessage).not.toHaveBeenCalled();
  });

  it('ignores escalation_request from self', async () => {
    const deps = makeDeps({ instanceId: 'local-instance' });
    const reactor = new AvaChannelReactorService(deps);

    const selfMsg = {
      id: 'msg-self',
      instanceId: 'local-instance',
      instanceName: 'local',
      content: `[escalation_request] ${JSON.stringify({
        featureId: 'feat-3',
        failureCount: 2,
        lastError: 'err',
        worktreeState: 'clean',
        originatingInstanceId: 'local-instance',
        featureData: {},
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof selfMsg) => Promise<void> }).handleWorkStealProtocol(selfMsg);

    expect(deps.avaChannelService.postMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Escalation accept — originator accepts first offer
// ---------------------------------------------------------------------------

describe('escalation_accept — originator accepts first escalation_offer', () => {
  it('sends escalation_accept with feature data for the first offer', async () => {
    const deps = makeDeps({ instanceId: 'originator-instance' });
    const reactor = new AvaChannelReactorService(deps);

    const offerMsg = {
      id: 'msg-offer-1',
      instanceId: 'peer-instance',
      instanceName: 'peer',
      content: `[escalation_offer] ${JSON.stringify({
        offeringInstanceId: 'peer-instance',
        originatingInstanceId: 'originator-instance',
        featureId: 'feat-1',
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof offerMsg) => Promise<void> }).handleWorkStealProtocol(offerMsg);

    expect(deps.avaChannelService.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('[escalation_accept]'),
      'system',
      expect.objectContaining({ intent: 'coordination' })
    );

    const callArg = (deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const payload = JSON.parse(callArg.replace('[escalation_accept]', '').trim());
    expect(payload.acceptingInstanceId).toBe('peer-instance');
    expect(payload.featureId).toBe('feat-1');
  });

  it('ignores a second escalation_offer for the same feature', async () => {
    const deps = makeDeps({ instanceId: 'originator-instance' });
    const reactor = new AvaChannelReactorService(deps);

    const makeOfferMsg = (offeringInstanceId: string) => ({
      id: `msg-offer-${offeringInstanceId}`,
      instanceId: offeringInstanceId,
      instanceName: offeringInstanceId,
      content: `[escalation_offer] ${JSON.stringify({
        offeringInstanceId,
        originatingInstanceId: 'originator-instance',
        featureId: 'feat-1',
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    });

    await (reactor as unknown as { handleWorkStealProtocol: (msg: ReturnType<typeof makeOfferMsg>) => Promise<void> }).handleWorkStealProtocol(makeOfferMsg('peer-1'));
    await (reactor as unknown as { handleWorkStealProtocol: (msg: ReturnType<typeof makeOfferMsg>) => Promise<void> }).handleWorkStealProtocol(makeOfferMsg('peer-2'));

    // Only one accept should have been sent
    const acceptCalls = (deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('[escalation_accept]')
    );
    expect(acceptCalls).toHaveLength(1);
  });

  it('ignores escalation_offer not targeting this instance', async () => {
    const deps = makeDeps({ instanceId: 'some-other-instance' });
    const reactor = new AvaChannelReactorService(deps);

    const offerMsg = {
      id: 'msg-offer-other',
      instanceId: 'peer-instance',
      instanceName: 'peer',
      content: `[escalation_offer] ${JSON.stringify({
        offeringInstanceId: 'peer-instance',
        originatingInstanceId: 'originator-instance', // not this instance
        featureId: 'feat-1',
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof offerMsg) => Promise<void> }).handleWorkStealProtocol(offerMsg);

    expect(deps.avaChannelService.postMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Escalation accept handling — accepting instance clones feature
// ---------------------------------------------------------------------------

describe('escalation_accept — accepting instance creates escalated feature', () => {
  it('creates feature with complexity escalated to large when original is medium', async () => {
    const deps = makeDeps({ instanceId: 'accepting-instance' });
    const reactor = new AvaChannelReactorService(deps);

    const acceptMsg = {
      id: 'msg-accept-1',
      instanceId: 'originator-instance',
      instanceName: 'originator',
      content: `[escalation_accept] ${JSON.stringify({
        acceptingInstanceId: 'accepting-instance',
        originatingInstanceId: 'originator-instance',
        featureId: 'feat-1',
        featureData: {
          id: 'feat-1',
          title: 'Test Feature',
          status: 'blocked',
          complexity: 'medium',
        },
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof acceptMsg) => Promise<void> }).handleWorkStealProtocol(acceptMsg);

    expect(deps.featureLoader!.create).toHaveBeenCalledWith(
      '/test/project',
      expect.objectContaining({
        complexity: 'large',
        status: 'backlog',
        escalatedFromInstanceId: 'originator-instance',
        escalatedFromFeatureId: 'feat-1',
      })
    );
  });

  it('creates feature with complexity escalated to architectural when original is large', async () => {
    const deps = makeDeps({ instanceId: 'accepting-instance' });
    const reactor = new AvaChannelReactorService(deps);

    const acceptMsg = {
      id: 'msg-accept-2',
      instanceId: 'originator-instance',
      instanceName: 'originator',
      content: `[escalation_accept] ${JSON.stringify({
        acceptingInstanceId: 'accepting-instance',
        originatingInstanceId: 'originator-instance',
        featureId: 'feat-large',
        featureData: {
          id: 'feat-large',
          title: 'Large Feature',
          status: 'blocked',
          complexity: 'large',
        },
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof acceptMsg) => Promise<void> }).handleWorkStealProtocol(acceptMsg);

    expect(deps.featureLoader!.create).toHaveBeenCalledWith(
      '/test/project',
      expect.objectContaining({ complexity: 'architectural' })
    );
  });

  it('ignores escalation_accept not targeting this instance', async () => {
    const deps = makeDeps({ instanceId: 'some-other-instance' });
    const reactor = new AvaChannelReactorService(deps);

    const acceptMsg = {
      id: 'msg-accept-3',
      instanceId: 'originator-instance',
      instanceName: 'originator',
      content: `[escalation_accept] ${JSON.stringify({
        acceptingInstanceId: 'different-instance',
        originatingInstanceId: 'originator-instance',
        featureId: 'feat-1',
        featureData: { id: 'feat-1', complexity: 'medium' },
      })}`,
      source: 'system' as const,
      timestamp: new Date().toISOString(),
    };

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof acceptMsg) => Promise<void> }).handleWorkStealProtocol(acceptMsg);

    expect(deps.featureLoader!.create).not.toHaveBeenCalled();
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
    await (reactor as unknown as { broadcastCapacityHeartbeat: () => Promise<void> }).broadcastCapacityHeartbeat();

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

    await (reactor as unknown as { broadcastCapacityHeartbeat: () => Promise<void> }).broadcastCapacityHeartbeat();

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

    await (reactor as unknown as { broadcastCapacityHeartbeat: () => Promise<void> }).broadcastCapacityHeartbeat();

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

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof alertMsg) => Promise<void> }).handleWorkStealProtocol(alertMsg);

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
    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof alertMsg) => Promise<void> }).handleWorkStealProtocol(alertMsg);

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
    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof heartbeatMsg) => Promise<void> }).handleWorkStealProtocol(heartbeatMsg);

    // work_request should NOT have been sent (peer is degraded)
    const workRequestCalls = (deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('[work_request]')
    );
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

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof alertMsg) => Promise<void> }).handleWorkStealProtocol(alertMsg);

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

    await (reactor as unknown as { handleWorkStealProtocol: (msg: typeof alertMsg) => Promise<void> }).handleWorkStealProtocol(alertMsg);

    expect(reactor.getStatus().degradedPeerCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getStatus() — escalation fields
// ---------------------------------------------------------------------------

describe('getStatus() — escalation and health fields', () => {
  it('reports degradedPeerCount and degradedPeers', async () => {
    const deps = makeDeps();
    const reactor = new AvaChannelReactorService(deps);

    const status = reactor.getStatus();
    expect(status.degradedPeerCount).toBe(0);
    expect(status.degradedPeers).toEqual([]);
    expect(status.pendingEscalationCount).toBe(0);
  });
});
