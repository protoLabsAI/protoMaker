import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GOAPLoopService } from '../../../src/services/goap-loop-service.js';
import { GOAPActionRegistry } from '../../../src/services/goap-action-registry.js';
import { registerAllActions } from '../../../src/services/goap-actions/index.js';
import type { GOAPLoopConfig, Feature } from '@automaker/types';

// ─── Mock Setup ──────────────────────────────────────────────────────────────

function createMockEvents() {
  return {
    emit: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as any;
}

function createMockFeatureLoader(features: Feature[] = []) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
    update: vi.fn().mockResolvedValue({}),
  } as any;
}

function createMockAutoModeService(
  opts: {
    isAutoLoopRunning?: boolean;
    runningCount?: number;
    maxConcurrency?: number;
  } = {}
) {
  return {
    getStatusForProject: vi.fn().mockReturnValue({
      isAutoLoopRunning: opts.isAutoLoopRunning ?? false,
      runningFeatures: [],
      runningCount: opts.runningCount ?? 0,
      maxConcurrency: opts.maxConcurrency ?? 3,
      branchName: null,
    }),
    startAutoLoopForProject: vi.fn().mockResolvedValue(3),
    stopAutoLoopForProject: vi.fn().mockResolvedValue(0),
    stopFeature: vi.fn().mockResolvedValue(true),
  } as any;
}

function createFeature(
  id: string,
  options: {
    status?: string;
    dependencies?: string[];
    startedAt?: string;
    failureCount?: number;
    complexity?: string;
    priority?: number;
  } = {}
): Feature {
  return {
    id,
    category: 'test',
    description: `Feature ${id}`,
    status: options.status || 'backlog',
    dependencies: options.dependencies,
    startedAt: options.startedAt,
    failureCount: options.failureCount,
    complexity: options.complexity as any,
    priority: options.priority as any,
  };
}

function createConfig(overrides: Partial<GOAPLoopConfig> = {}): GOAPLoopConfig {
  return {
    projectPath: '/test/project',
    branchName: null,
    tickIntervalMs: 100, // Fast for tests
    maxConsecutiveErrors: 3,
    enabled: true,
    maxActionHistorySize: 100,
    ...overrides,
  };
}

function resetSingleton() {
  (GOAPLoopService as any).instance = null;
}

function createServiceWithRegistry(events: any, featureLoader: any, autoModeService: any) {
  const registry = new GOAPActionRegistry();
  registerAllActions(registry, featureLoader, autoModeService);
  return GOAPLoopService.getInstance(events, featureLoader, autoModeService, registry);
}

describe('GOAPLoopService', () => {
  let events: ReturnType<typeof createMockEvents>;
  let featureLoader: ReturnType<typeof createMockFeatureLoader>;
  let autoModeService: ReturnType<typeof createMockAutoModeService>;
  let service: GOAPLoopService;

  beforeEach(() => {
    vi.useFakeTimers();
    resetSingleton();
    events = createMockEvents();
    featureLoader = createMockFeatureLoader();
    autoModeService = createMockAutoModeService();
    service = createServiceWithRegistry(events, featureLoader, autoModeService);
  });

  afterEach(async () => {
    const loops = service.listRunningLoops();
    for (const loop of loops) {
      try {
        await service.stopLoop(loop.projectPath);
      } catch {
        // ignore
      }
    }
    vi.useRealTimers();
  });

  describe('startLoop', () => {
    it('should start a loop and emit goap:started', async () => {
      const config = createConfig();
      await service.startLoop(config);

      expect(events.emit).toHaveBeenCalledWith(
        'goap:started',
        expect.objectContaining({ projectPath: config.projectPath })
      );

      const status = service.getStatus(config.projectPath);
      expect(status).not.toBeNull();
      expect(status!.isRunning).toBe(true);
      expect(status!.isPaused).toBe(false);
      expect(status!.tickCount).toBe(0);
      expect(status!.currentPlan).toBeNull();
      expect(status!.currentPlanStep).toBe(0);
    });

    it('should throw if loop is already running for the project', async () => {
      const config = createConfig();
      await service.startLoop(config);
      await expect(service.startLoop(config)).rejects.toThrow('already running');
    });
  });

  describe('stopLoop', () => {
    it('should stop a running loop and emit goap:stopped', async () => {
      const config = createConfig();
      await service.startLoop(config);
      await service.stopLoop(config.projectPath);

      expect(events.emit).toHaveBeenCalledWith(
        'goap:stopped',
        expect.objectContaining({ projectPath: config.projectPath })
      );

      const status = service.getStatus(config.projectPath);
      expect(status).toBeNull();
    });

    it('should throw if no loop is running', async () => {
      await expect(service.stopLoop('/not/running')).rejects.toThrow('No GOAP loop');
    });
  });

  describe('pauseLoop / resumeLoop', () => {
    it('should pause and resume a running loop', async () => {
      const config = createConfig();
      await service.startLoop(config);
      await service.pauseLoop(config.projectPath);

      const pausedStatus = service.getStatus(config.projectPath);
      expect(pausedStatus!.isPaused).toBe(true);
      expect(events.emit).toHaveBeenCalledWith(
        'goap:paused',
        expect.objectContaining({ projectPath: config.projectPath })
      );

      await service.resumeLoop(config.projectPath);

      const resumedStatus = service.getStatus(config.projectPath);
      expect(resumedStatus!.isPaused).toBe(false);
      expect(events.emit).toHaveBeenCalledWith(
        'goap:resumed',
        expect.objectContaining({ projectPath: config.projectPath })
      );
    });
  });

  describe('listRunningLoops', () => {
    it('should list all running loops', async () => {
      await service.startLoop(createConfig({ projectPath: '/project/a' }));
      await service.startLoop(createConfig({ projectPath: '/project/b' }));

      const loops = service.listRunningLoops();
      expect(loops).toHaveLength(2);
      expect(loops.map((l) => l.projectPath).sort()).toEqual(['/project/a', '/project/b']);
    });
  });

  describe('tick - plan-based action selection', () => {
    it('should generate a plan and select start_auto_mode when backlog exists and auto-mode off', async () => {
      const features = [createFeature('f1', { status: 'backlog' })];
      featureLoader = createMockFeatureLoader(features);
      autoModeService = createMockAutoModeService({ isAutoLoopRunning: false });

      resetSingleton();
      service = createServiceWithRegistry(events, featureLoader, autoModeService);

      await service.startLoop(createConfig());
      await vi.advanceTimersByTimeAsync(0);

      // Should have generated a plan
      expect(events.emit).toHaveBeenCalledWith(
        'goap:plan_generated',
        expect.objectContaining({
          projectPath: '/test/project',
          plan: expect.objectContaining({
            actions: expect.arrayContaining([expect.objectContaining({ id: 'start_auto_mode' })]),
          }),
        })
      );

      // Should have selected the action
      expect(events.emit).toHaveBeenCalledWith(
        'goap:action_selected',
        expect.objectContaining({
          action: expect.objectContaining({ id: 'start_auto_mode' }),
        })
      );

      expect(autoModeService.startAutoLoopForProject).toHaveBeenCalledWith('/test/project', null);
    });

    it('should select retry_failed_feature when there are retryable failed features', async () => {
      const features = [createFeature('f1', { status: 'failed', failureCount: 1 })];
      featureLoader = createMockFeatureLoader(features);
      autoModeService = createMockAutoModeService({ isAutoLoopRunning: true });

      resetSingleton();
      service = createServiceWithRegistry(events, featureLoader, autoModeService);

      await service.startLoop(createConfig());
      await vi.advanceTimersByTimeAsync(0);

      expect(events.emit).toHaveBeenCalledWith(
        'goap:action_selected',
        expect.objectContaining({
          action: expect.objectContaining({ id: 'retry_failed_feature' }),
        })
      );

      expect(featureLoader.update).toHaveBeenCalledWith(
        '/test/project',
        'f1',
        expect.objectContaining({ status: 'backlog', failureCount: 2 })
      );
    });

    it('should emit goap:tick after each tick', async () => {
      featureLoader = createMockFeatureLoader([]);
      autoModeService = createMockAutoModeService();

      resetSingleton();
      service = createServiceWithRegistry(events, featureLoader, autoModeService);

      await service.startLoop(createConfig());
      await vi.advanceTimersByTimeAsync(0);

      expect(events.emit).toHaveBeenCalledWith(
        'goap:tick',
        expect.objectContaining({
          projectPath: '/test/project',
          status: expect.objectContaining({ tickCount: 1 }),
        })
      );
    });

    it('should include plan info in status', async () => {
      const features = [createFeature('f1', { status: 'backlog' })];
      featureLoader = createMockFeatureLoader(features);
      autoModeService = createMockAutoModeService({ isAutoLoopRunning: false });

      resetSingleton();
      service = createServiceWithRegistry(events, featureLoader, autoModeService);

      await service.startLoop(createConfig());
      await vi.advanceTimersByTimeAsync(0);

      const status = service.getStatus('/test/project');
      // After first tick, plan should have been executed (step advanced or plan completed)
      // The currentPlanStep reflects post-execution state
      expect(status!.tickCount).toBe(1);
    });
  });

  describe('tick - error handling', () => {
    it('should auto-pause after maxConsecutiveErrors', async () => {
      autoModeService = {
        getStatusForProject: vi.fn().mockImplementation(() => {
          throw new Error('service unavailable');
        }),
        startAutoLoopForProject: vi.fn(),
        stopAutoLoopForProject: vi.fn(),
        stopFeature: vi.fn(),
      } as any;
      featureLoader = createMockFeatureLoader([]);

      resetSingleton();
      service = createServiceWithRegistry(events, featureLoader, autoModeService);

      await service.startLoop(createConfig({ maxConsecutiveErrors: 2, tickIntervalMs: 10 }));

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10);

      const status = service.getStatus('/test/project');
      expect(status!.isPaused).toBe(true);
      expect(status!.consecutiveErrors).toBe(2);

      expect(events.emit).toHaveBeenCalledWith(
        'goap:paused',
        expect.objectContaining({
          reason: 'max_consecutive_errors',
        })
      );
    });

    it('should reset consecutive errors on successful action', async () => {
      let callCount = 0;
      autoModeService = {
        getStatusForProject: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) throw new Error('transient error');
          return {
            isAutoLoopRunning: false,
            runningFeatures: [],
            runningCount: 0,
            maxConcurrency: 3,
            branchName: null,
          };
        }),
        startAutoLoopForProject: vi.fn().mockResolvedValue(3),
        stopAutoLoopForProject: vi.fn(),
        stopFeature: vi.fn(),
      } as any;
      // Need backlog features so planner can generate a plan (start_auto_mode)
      featureLoader = createMockFeatureLoader([createFeature('f1', { status: 'backlog' })]);

      resetSingleton();
      service = createServiceWithRegistry(events, featureLoader, autoModeService);

      await service.startLoop(createConfig({ tickIntervalMs: 10 }));

      await vi.advanceTimersByTimeAsync(0);
      expect(service.getStatus('/test/project')!.consecutiveErrors).toBe(1);

      await vi.advanceTimersByTimeAsync(10);
      expect(service.getStatus('/test/project')!.consecutiveErrors).toBe(0);
    });
  });

  describe('tick - action history', () => {
    it('should trim action history when exceeding maxActionHistorySize', async () => {
      featureLoader = createMockFeatureLoader([]);
      autoModeService = createMockAutoModeService();

      resetSingleton();
      service = createServiceWithRegistry(events, featureLoader, autoModeService);

      await service.startLoop(
        createConfig({
          tickIntervalMs: 10,
          maxActionHistorySize: 3,
        })
      );

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);

      const status = service.getStatus('/test/project');
      expect(status!.actionHistory.length).toBeLessThanOrEqual(3);
    });
  });

  describe('action execution - escalate_stuck_feature', () => {
    it('should escalate stale features to architectural complexity', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const features = [createFeature('f1', { status: 'running', startedAt: threeHoursAgo })];
      featureLoader = createMockFeatureLoader(features);
      autoModeService = createMockAutoModeService({ isAutoLoopRunning: true, runningCount: 1 });

      resetSingleton();
      service = createServiceWithRegistry(events, featureLoader, autoModeService);

      await service.startLoop(createConfig());
      await vi.advanceTimersByTimeAsync(0);

      expect(featureLoader.update).toHaveBeenCalledWith(
        '/test/project',
        'f1',
        expect.objectContaining({ complexity: 'architectural', startedAt: expect.any(String) })
      );
    });
  });

  describe('plan lifecycle', () => {
    it('should generate a new plan when previous plan completes', async () => {
      // First tick: has backlog + auto-mode off → plans start_auto_mode
      const features = [
        createFeature('f1', { status: 'backlog' }),
        createFeature('f2', { status: 'failed', failureCount: 1 }),
      ];
      featureLoader = createMockFeatureLoader(features);
      autoModeService = createMockAutoModeService({ isAutoLoopRunning: false });

      resetSingleton();
      service = createServiceWithRegistry(events, featureLoader, autoModeService);

      await service.startLoop(createConfig({ tickIntervalMs: 10 }));
      await vi.advanceTimersByTimeAsync(0);

      // First tick should have planned and executed start_auto_mode
      const planGeneratedCalls = events.emit.mock.calls.filter(
        (c: any[]) => c[0] === 'goap:plan_generated'
      );
      expect(planGeneratedCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
