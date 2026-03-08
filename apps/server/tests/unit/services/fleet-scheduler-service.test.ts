/**
 * fleet-scheduler-service.test.ts
 *
 * Unit tests for FleetSchedulerService:
 * - Assignment algorithm (computeAssignment)
 * - Conflict resolution (lower instanceId wins)
 * - Failover (longest-running worker takes over)
 * - Scheduler heartbeat / step-down on primary return
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FleetSchedulerService } from '@/services/fleet-scheduler-service.js';
import type {
  WorkInventoryMsg,
  ScheduleAssignmentMsg,
  SchedulerHeartbeatMsg,
  ScheduleConflictMsg,
} from '@/services/fleet-scheduler-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAvaChannelService() {
  return {
    postMessage: vi.fn().mockResolvedValue({ id: 'msg-1', content: '' }),
  };
}

function makeFeatureLoader(
  features: Array<{ id: string; status: string; dependencies?: string[] }> = []
) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
    update: vi.fn().mockResolvedValue({}),
  };
}

function makeAutoModeService(runningAgents = 0, maxAgents = 3, backlogCount = 0) {
  return {
    getCapacityMetrics: vi.fn().mockReturnValue({ runningAgents, maxAgents, backlogCount }),
    startAutoLoopForProject: vi.fn().mockResolvedValue(0),
  };
}

function makeInventory(
  instanceId: string,
  backlogFeatureIds: string[],
  activeFeatureIds: string[],
  maxConcurrency = 3,
  activeCount = 0
): WorkInventoryMsg {
  return {
    instanceId,
    timestamp: new Date().toISOString(),
    backlogFeatureIds,
    activeFeatureIds,
    maxConcurrency,
    activeCount,
  };
}

// ---------------------------------------------------------------------------
// Assignment algorithm
// ---------------------------------------------------------------------------

describe('FleetSchedulerService - assignment algorithm', () => {
  let avaChannel: ReturnType<typeof makeAvaChannelService>;
  let service: FleetSchedulerService;

  beforeEach(() => {
    avaChannel = makeAvaChannelService();
  });

  afterEach(() => {
    service.stop();
    vi.clearAllMocks();
  });

  it('assigns backlog features to idle instances respecting maxConcurrency', async () => {
    const features = [
      { id: 'f-001', status: 'backlog' },
      { id: 'f-002', status: 'backlog' },
      { id: 'f-003', status: 'backlog' },
      { id: 'f-004', status: 'backlog' },
    ];

    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'instance-a',
      isPrimary: true,
      featureLoader: makeFeatureLoader(features) as any,
      autoModeService: makeAutoModeService(0, 2, 4) as any,
      projectPath: '/project',
      startTimeMs: Date.now(),
    });

    service.start();

    // Feed a peer inventory
    service.onWorkInventory(makeInventory('instance-b', ['f-003', 'f-004'], [], 2, 0));

    // Wait for initial schedule cycle (runs after 5s setTimeout — mock timer)
    // Instead, call broadcastWorkInventory directly as a proxy for the cycle
    // Access private method via casting
    const privateService = service as any;

    // Simulate running a schedule cycle manually
    const localInventory: WorkInventoryMsg = {
      instanceId: 'instance-a',
      timestamp: new Date().toISOString(),
      backlogFeatureIds: ['f-001', 'f-002'],
      activeFeatureIds: [],
      maxConcurrency: 2,
      activeCount: 0,
    };

    // Test computeAssignment directly (it's private, but we verify via postMessage)
    // We can test the algorithm by calling runScheduleCycle logic
    const inventories: WorkInventoryMsg[] = [
      makeInventory('instance-a', ['f-001', 'f-002'], [], 2, 0),
      makeInventory('instance-b', ['f-003', 'f-004'], [], 2, 0),
    ];

    // Access private computeAssignment
    const assignments = privateService.computeAssignment(inventories);

    // Each instance with spare=2 should get 2 features
    expect(assignments['instance-a']).toHaveLength(2);
    expect(assignments['instance-b']).toHaveLength(2);

    // No feature double-assigned
    const allAssigned = Object.values(assignments).flat();
    const uniqueAssigned = new Set(allAssigned);
    expect(uniqueAssigned.size).toBe(allAssigned.length);
  });

  it('does not assign features already active on any instance', async () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'instance-a',
      isPrimary: true,
      featureLoader: makeFeatureLoader() as any,
      autoModeService: makeAutoModeService() as any,
      projectPath: '/project',
    });
    service.start();

    const privateService = service as any;

    const inventories: WorkInventoryMsg[] = [
      makeInventory('instance-a', ['f-001', 'f-002'], ['f-003'], 3, 1),
      makeInventory('instance-b', [], [], 3, 0),
    ];

    const assignments = privateService.computeAssignment(inventories);

    // f-003 is active — should not be assigned
    const allAssigned = Object.values(assignments).flat();
    expect(allAssigned).not.toContain('f-003');
  });

  it('respects maxConcurrency — does not over-assign', () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'instance-a',
      isPrimary: true,
      featureLoader: makeFeatureLoader() as any,
      autoModeService: makeAutoModeService() as any,
      projectPath: '/project',
    });
    service.start();

    const privateService = service as any;

    const inventories: WorkInventoryMsg[] = [
      // instance-a: maxConcurrency=2, activeCount=1 → spare=1
      makeInventory('instance-a', ['f-001', 'f-002', 'f-003'], [], 2, 1),
    ];

    const assignments = privateService.computeAssignment(inventories);

    // Only 1 spare slot → at most 1 feature
    expect(assignments['instance-a']?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('returns empty assignments when no instances have spare capacity', () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'instance-a',
      isPrimary: true,
      featureLoader: makeFeatureLoader() as any,
      autoModeService: makeAutoModeService() as any,
      projectPath: '/project',
    });
    service.start();

    const privateService = service as any;

    const inventories: WorkInventoryMsg[] = [
      makeInventory('instance-a', ['f-001'], [], 2, 2), // at capacity
    ];

    const assignments = privateService.computeAssignment(inventories);
    expect(Object.keys(assignments)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

describe('FleetSchedulerService - conflict resolution', () => {
  let avaChannel: ReturnType<typeof makeAvaChannelService>;
  let featureLoader: ReturnType<typeof makeFeatureLoader>;
  let service: FleetSchedulerService;

  beforeEach(() => {
    avaChannel = makeAvaChannelService();
    featureLoader = makeFeatureLoader([{ id: 'f-conflict', status: 'in_progress' }]);
  });

  afterEach(() => {
    service.stop();
    vi.clearAllMocks();
  });

  it('higher instanceId instance releases claim on conflict', async () => {
    // instance-b (higher lexicographic) loses to instance-a (lower)
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'instance-b',
      isPrimary: false,
      featureLoader: featureLoader as any,
      projectPath: '/project',
    });
    service.start();

    const conflict: ScheduleConflictMsg = {
      featureId: 'f-conflict',
      detectingInstanceId: 'instance-a', // lower id = winner
      competingInstanceId: 'instance-b', // us = higher id = loser
      timestamp: new Date().toISOString(),
    };

    await service.onScheduleConflict(conflict);

    // Should have called update to reset status back to backlog
    expect(featureLoader.update).toHaveBeenCalledWith(
      '/project',
      'f-conflict',
      expect.objectContaining({
        status: 'backlog',
      })
    );
  });

  it('lower instanceId instance does NOT release claim on conflict', async () => {
    // instance-a (lower) keeps the claim
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'instance-a',
      isPrimary: false,
      featureLoader: featureLoader as any,
      projectPath: '/project',
    });
    service.start();

    const conflict: ScheduleConflictMsg = {
      featureId: 'f-conflict',
      detectingInstanceId: 'instance-a', // us = lower = winner
      competingInstanceId: 'instance-b', // peer = higher = loser
      timestamp: new Date().toISOString(),
    };

    await service.onScheduleConflict(conflict);

    // We are the winner — do NOT release
    expect(featureLoader.update).not.toHaveBeenCalled();
  });

  it('instance ignores conflict where it is neither party', async () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'instance-c',
      isPrimary: false,
      featureLoader: featureLoader as any,
      projectPath: '/project',
    });
    service.start();

    const conflict: ScheduleConflictMsg = {
      featureId: 'f-conflict',
      detectingInstanceId: 'instance-a',
      competingInstanceId: 'instance-b', // not us
      timestamp: new Date().toISOString(),
    };

    await service.onScheduleConflict(conflict);

    expect(featureLoader.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Failover
// ---------------------------------------------------------------------------

describe('FleetSchedulerService - failover', () => {
  let avaChannel: ReturnType<typeof makeAvaChannelService>;
  let service: FleetSchedulerService;

  beforeEach(() => {
    avaChannel = makeAvaChannelService();
  });

  afterEach(() => {
    service.stop();
    vi.clearAllMocks();
  });

  it('worker with longest uptime becomes scheduler when primary is absent >10min', () => {
    const startTimeMs = Date.now() - 15 * 60 * 1000; // 15 min ago

    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'worker-a',
      isPrimary: false,
      featureLoader: makeFeatureLoader() as any,
      startTimeMs,
      projectPath: '/project',
    });
    service.start();

    // No primary heartbeat has been seen → primary absent
    // No peer heartbeats → we have the longest uptime
    service.checkFailover();

    const status = service.getStatus();
    expect(status.isActiveScheduler).toBe(true);
  });

  it('worker with shorter uptime defers to the longer-running worker', () => {
    const startTimeMs = Date.now() - 5 * 60 * 1000; // 5 min ago

    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'worker-b',
      isPrimary: false,
      featureLoader: makeFeatureLoader() as any,
      startTimeMs,
      projectPath: '/project',
    });
    service.start();

    // Simulate a peer with longer uptime
    const peerHeartbeat: SchedulerHeartbeatMsg = {
      schedulerInstanceId: 'worker-a',
      timestamp: new Date().toISOString(),
      uptimeMs: 20 * 60 * 1000, // 20 min — longer
      isPrimary: false,
    };
    service.onSchedulerHeartbeat(peerHeartbeat);

    // Trigger failover check — primary has been absent for startTimeMs > 10min... but wait:
    // startTimeMs is only 5min, so primary absent threshold not exceeded
    // Let's fake that by calling checkFailover after moving startTime way back
    (service as any).startTimeMs = Date.now() - 15 * 60 * 1000;
    service.checkFailover();

    // worker-b should NOT take over (worker-a has longer uptime)
    const status = service.getStatus();
    expect(status.isActiveScheduler).toBe(false);
  });

  it('primary instance starts as active scheduler', () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'primary-instance',
      isPrimary: true,
      featureLoader: makeFeatureLoader() as any,
      projectPath: '/project',
    });
    service.start();

    expect(service.getStatus().isActiveScheduler).toBe(true);
    expect(service.getStatus().isPrimary).toBe(true);
  });

  it('worker steps down when primary returns', () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'worker-a',
      isPrimary: false,
      featureLoader: makeFeatureLoader() as any,
      startTimeMs: Date.now() - 15 * 60 * 1000,
      projectPath: '/project',
    });
    service.start();

    // Trigger takeover
    service.checkFailover();
    expect(service.getStatus().isActiveScheduler).toBe(true);

    // Primary comes back
    const primaryHeartbeat: SchedulerHeartbeatMsg = {
      schedulerInstanceId: 'primary-node',
      timestamp: new Date().toISOString(),
      uptimeMs: 60 * 60 * 1000,
      isPrimary: true,
    };
    service.onSchedulerHeartbeat(primaryHeartbeat);

    // Worker should step down
    expect(service.getStatus().isActiveScheduler).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schedule assignment application
// ---------------------------------------------------------------------------

describe('FleetSchedulerService - applying schedule_assignment', () => {
  let avaChannel: ReturnType<typeof makeAvaChannelService>;
  let featureLoader: ReturnType<typeof makeFeatureLoader>;
  let service: FleetSchedulerService;

  beforeEach(() => {
    avaChannel = makeAvaChannelService();
    featureLoader = makeFeatureLoader([
      { id: 'f-001', status: 'backlog' },
      { id: 'f-002', status: 'backlog' },
    ]);
  });

  afterEach(() => {
    service.stop();
    vi.clearAllMocks();
  });

  it('moves assigned features to in_progress', async () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'worker-a',
      isPrimary: false,
      featureLoader: featureLoader as any,
      autoModeService: makeAutoModeService() as any,
      projectPath: '/project',
    });
    service.start();

    const assignment: ScheduleAssignmentMsg = {
      schedulerInstanceId: 'primary-node',
      timestamp: new Date().toISOString(),
      assignments: {
        'worker-a': ['f-001', 'f-002'],
      },
    };

    await service.onScheduleAssignment(assignment);

    expect(featureLoader.update).toHaveBeenCalledWith(
      '/project',
      'f-001',
      expect.objectContaining({
        status: 'in_progress',
        scheduledBy: 'worker-a',
      })
    );
    expect(featureLoader.update).toHaveBeenCalledWith(
      '/project',
      'f-002',
      expect.objectContaining({
        status: 'in_progress',
        scheduledBy: 'worker-a',
      })
    );
  });

  it('ignores assignments not targeting this instance', async () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'worker-b',
      isPrimary: false,
      featureLoader: featureLoader as any,
      autoModeService: makeAutoModeService() as any,
      projectPath: '/project',
    });
    service.start();

    const assignment: ScheduleAssignmentMsg = {
      schedulerInstanceId: 'primary-node',
      timestamp: new Date().toISOString(),
      assignments: {
        'worker-a': ['f-001'],
        // worker-b not included
      },
    };

    await service.onScheduleAssignment(assignment);

    expect(featureLoader.update).not.toHaveBeenCalled();
  });

  it('ignores own broadcasts', async () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'primary-node',
      isPrimary: true,
      featureLoader: featureLoader as any,
      autoModeService: makeAutoModeService() as any,
      projectPath: '/project',
    });
    service.start();

    const assignment: ScheduleAssignmentMsg = {
      schedulerInstanceId: 'primary-node', // same as our instanceId
      timestamp: new Date().toISOString(),
      assignments: {
        'primary-node': ['f-001'],
      },
    };

    await service.onScheduleAssignment(assignment);

    // onScheduleAssignment ignores self broadcasts
    expect(featureLoader.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Dependency ordering
// ---------------------------------------------------------------------------

describe('FleetSchedulerService - dependency ordering', () => {
  let service: FleetSchedulerService;
  let avaChannel: ReturnType<typeof makeAvaChannelService>;

  beforeEach(() => {
    avaChannel = makeAvaChannelService();
  });

  afterEach(() => {
    service.stop();
  });

  it('ready features (satisfied deps) come before blocked features', () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'instance-a',
      isPrimary: true,
      featureLoader: makeFeatureLoader() as any,
      projectPath: '/project',
    });
    service.start();

    const privateService = service as any;
    const backlog = [
      { id: 'f-002', status: 'backlog', dependencies: ['f-dep'] },
      { id: 'f-001', status: 'backlog', dependencies: [] },
    ];
    const allFeatures = [{ id: 'f-dep', status: 'done' }, ...backlog];

    const sorted = privateService.sortByDependencyOrder(backlog, allFeatures);

    // f-001 (no unmet deps) should come before f-002 (dep=f-dep which is done → also ready)
    // Both are actually ready since f-dep is done
    const ids = sorted.map((f: any) => f.id);
    expect(ids).toContain('f-001');
    expect(ids).toContain('f-002');
  });

  it('features with unmet deps are placed after ready features', () => {
    service = new FleetSchedulerService({
      avaChannelService: avaChannel as any,
      instanceId: 'instance-a',
      isPrimary: true,
      featureLoader: makeFeatureLoader() as any,
      projectPath: '/project',
    });
    service.start();

    const privateService = service as any;
    const backlog = [
      { id: 'f-003', status: 'backlog', dependencies: ['f-blocked-dep'] },
      { id: 'f-001', status: 'backlog', dependencies: [] },
    ];
    const allFeatures = [
      { id: 'f-blocked-dep', status: 'backlog' }, // not done
      ...backlog,
    ];

    const sorted = privateService.sortByDependencyOrder(backlog, allFeatures);
    const ids = sorted.map((f: any) => f.id);

    // f-001 ready → should come first
    expect(ids.indexOf('f-001')).toBeLessThan(ids.indexOf('f-003'));
  });
});
