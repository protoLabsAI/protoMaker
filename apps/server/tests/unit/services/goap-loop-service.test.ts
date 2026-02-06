import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GOAPLoopService } from '../../../src/services/goap-loop-service.js';
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

// Reset singleton between tests
function resetSingleton() {
  // Access private static field to reset singleton
  (GOAPLoopService as any).instance = null;
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
    service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);
  });

  afterEach(async () => {
    // Stop any running loops
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

  describe('tick - action selection', () => {
    it('should select start_auto_mode when backlog work exists and auto-mode is off', async () => {
      const features = [createFeature('f1', { status: 'backlog' })];
      featureLoader = createMockFeatureLoader(features);
      autoModeService = createMockAutoModeService({ isAutoLoopRunning: false });

      resetSingleton();
      service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);

      await service.startLoop(createConfig());

      // First tick runs immediately via setTimeout(0)
      await vi.advanceTimersByTimeAsync(0);

      // Check that start_auto_mode was the selected action
      expect(events.emit).toHaveBeenCalledWith(
        'goap:action_selected',
        expect.objectContaining({
          action: expect.objectContaining({ id: 'start_auto_mode' }),
        })
      );

      // And auto-mode should have been started
      expect(autoModeService.startAutoLoopForProject).toHaveBeenCalledWith('/test/project', null);
    });

    it('should select retry_failed_feature when there are failed features', async () => {
      const features = [createFeature('f1', { status: 'failed', failureCount: 1 })];
      featureLoader = createMockFeatureLoader(features);
      autoModeService = createMockAutoModeService({ isAutoLoopRunning: true });

      resetSingleton();
      service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);

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

    it('should select log_idle when system is idle', async () => {
      featureLoader = createMockFeatureLoader([]); // no features
      autoModeService = createMockAutoModeService({ runningCount: 0 });

      resetSingleton();
      service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);

      await service.startLoop(createConfig());
      await vi.advanceTimersByTimeAsync(0);

      expect(events.emit).toHaveBeenCalledWith(
        'goap:action_selected',
        expect.objectContaining({
          action: expect.objectContaining({ id: 'log_idle' }),
        })
      );
    });

    it('should emit goap:tick after each tick', async () => {
      featureLoader = createMockFeatureLoader([]);
      autoModeService = createMockAutoModeService();

      resetSingleton();
      service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);

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
  });

  describe('tick - error handling', () => {
    it('should auto-pause after maxConsecutiveErrors', async () => {
      // Make autoModeService.getStatusForProject throw to cause tick-level errors
      // (evaluateWorldState catches featureLoader errors, so we need to break the auto-mode call)
      autoModeService = {
        getStatusForProject: vi.fn().mockImplementation(() => {
          throw new Error('service unavailable');
        }),
        startAutoLoopForProject: vi.fn(),
      } as any;
      featureLoader = createMockFeatureLoader([]);

      resetSingleton();
      service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);

      await service.startLoop(createConfig({ maxConsecutiveErrors: 2, tickIntervalMs: 10 }));

      // Tick 1 (immediate)
      await vi.advanceTimersByTimeAsync(0);
      // Tick 2 (after 10ms)
      await vi.advanceTimersByTimeAsync(10);

      // Should be paused now
      const status = service.getStatus('/test/project');
      expect(status!.isPaused).toBe(true);
      expect(status!.consecutiveErrors).toBe(2);

      // Should have emitted goap:paused with reason
      expect(events.emit).toHaveBeenCalledWith(
        'goap:paused',
        expect.objectContaining({
          reason: 'max_consecutive_errors',
        })
      );
    });

    it('should reset consecutive errors on successful action', async () => {
      // First call to getStatusForProject throws, second succeeds
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
      } as any;
      featureLoader = createMockFeatureLoader([]);

      resetSingleton();
      service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);

      await service.startLoop(createConfig({ tickIntervalMs: 10 }));

      // Tick 1 (fails)
      await vi.advanceTimersByTimeAsync(0);
      expect(service.getStatus('/test/project')!.consecutiveErrors).toBe(1);

      // Tick 2 (succeeds)
      await vi.advanceTimersByTimeAsync(10);
      expect(service.getStatus('/test/project')!.consecutiveErrors).toBe(0);
    });
  });

  describe('tick - action history', () => {
    it('should trim action history when exceeding maxActionHistorySize', async () => {
      featureLoader = createMockFeatureLoader([]); // idle state
      autoModeService = createMockAutoModeService();

      resetSingleton();
      service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);

      await service.startLoop(
        createConfig({
          tickIntervalMs: 10,
          maxActionHistorySize: 3,
        })
      );

      // Run 5 ticks
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);

      const status = service.getStatus('/test/project');
      // Should be trimmed to 3
      expect(status!.actionHistory.length).toBeLessThanOrEqual(3);
    });
  });

  describe('action execution - start_auto_mode already running', () => {
    it('should treat "already running" error as success', async () => {
      const features = [createFeature('f1', { status: 'backlog' })];
      featureLoader = createMockFeatureLoader(features);
      autoModeService = createMockAutoModeService({ isAutoLoopRunning: false });
      autoModeService.startAutoLoopForProject = vi
        .fn()
        .mockRejectedValue(new Error('Auto mode is already running'));

      resetSingleton();
      service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);

      await service.startLoop(createConfig());
      await vi.advanceTimersByTimeAsync(0);

      // Should emit action_executed (not action_failed)
      expect(events.emit).toHaveBeenCalledWith(
        'goap:action_executed',
        expect.objectContaining({
          result: expect.objectContaining({ success: true }),
        })
      );
    });
  });

  describe('action execution - escalate_stuck_feature', () => {
    it('should escalate stale features to architectural complexity', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const features = [createFeature('f1', { status: 'running', startedAt: threeHoursAgo })];
      featureLoader = createMockFeatureLoader(features);
      // Auto-mode running, no failed features, but has stale
      autoModeService = createMockAutoModeService({ isAutoLoopRunning: true, runningCount: 1 });

      resetSingleton();
      service = GOAPLoopService.getInstance(events, featureLoader, autoModeService);

      await service.startLoop(createConfig());
      await vi.advanceTimersByTimeAsync(0);

      expect(featureLoader.update).toHaveBeenCalledWith(
        '/test/project',
        'f1',
        expect.objectContaining({ complexity: 'architectural', startedAt: expect.any(String) })
      );
    });
  });
});
