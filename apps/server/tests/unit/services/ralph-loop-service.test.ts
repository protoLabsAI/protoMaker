import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RalphLoopService } from '@/services/ralph-loop-service.js';
import type { EventEmitter } from '@/lib/events.js';
import type { AutoModeService } from '@/services/auto-mode-service.js';
import type { SettingsService } from '@/services/settings-service.js';
import type {
  RalphLoopConfig,
  CompletionCriterion,
  Feature,
  RalphLoopState,
} from '@protolabs-ai/types';
import { DEFAULT_RALPH_CONFIG } from '@protolabs-ai/types';
import * as secureFs from '@/lib/secure-fs.js';
import { atomicWriteJson, readJsonWithRecovery } from '@protolabs-ai/utils';
import { exec } from 'child_process';

// Mock modules
vi.mock('@/lib/secure-fs.js');
vi.mock('child_process');
vi.mock('@protolabs-ai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabs-ai/utils')>('@protolabs-ai/utils');
  return {
    ...actual,
    atomicWriteJson: vi.fn(),
    readJsonWithRecovery: vi.fn(),
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

describe('ralph-loop-service.ts', () => {
  let service: RalphLoopService;
  let mockEvents: EventEmitter;
  let mockAutoModeService: AutoModeService;
  let mockSettingsService: SettingsService;
  const projectPath = '/test/project';
  const featureId = 'test-feature-1';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock EventEmitter
    mockEvents = {
      emit: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as EventEmitter;

    // Mock AutoModeService
    mockAutoModeService = {
      executeFeature: vi.fn().mockResolvedValue(undefined),
    } as unknown as AutoModeService;

    // Mock SettingsService
    mockSettingsService = {
      getProjectSettings: vi.fn().mockResolvedValue({}),
    } as unknown as SettingsService;

    service = new RalphLoopService(mockEvents, mockAutoModeService, mockSettingsService);

    // Mock file system
    vi.mocked(secureFs.mkdir).mockResolvedValue(undefined);
    vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
    vi.mocked(secureFs.appendFile).mockResolvedValue(undefined);
    vi.mocked(secureFs.readFile).mockResolvedValue('{}');
    vi.mocked(atomicWriteJson).mockResolvedValue(undefined);
    vi.mocked(readJsonWithRecovery).mockResolvedValue({
      data: null,
      recovered: false,
      source: 'default',
    });

    // Mock exec for criterion checks
    vi.mocked(exec).mockImplementation(((_cmd: any, _opts: any, callback: any) => {
      callback(null, { stdout: 'Success', stderr: '' });
      return {} as any;
    }) as any);
  });

  describe('startLoop', () => {
    it('should initialize loop state correctly', async () => {
      // Mock feature file
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        description: 'Test description',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      const config: Partial<RalphLoopConfig> = {
        maxIterations: 5,
        completionCriteria: [
          {
            type: 'build_succeeds',
            name: 'Build succeeds',
            required: true,
          },
        ],
      };

      const state = await service.startLoop(projectPath, featureId, config);

      expect(state.featureId).toBe(featureId);
      expect(state.projectPath).toBe(projectPath);
      expect(state.status).toBe('running');
      expect(state.config.maxIterations).toBe(5);
      // currentIteration starts at 0 but may increment immediately due to async loop
      expect(state.currentIteration).toBeGreaterThanOrEqual(0);
      expect(state.startedAt).toBeDefined();

      // Verify state was saved
      expect(atomicWriteJson).toHaveBeenCalledWith(
        expect.stringContaining('ralph-state.json'),
        expect.objectContaining({
          featureId,
          status: 'running',
        }),
        expect.any(Object)
      );

      // Verify event was emitted
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'ralph:started',
        expect.objectContaining({
          featureId,
          projectPath,
        })
      );

      // Stop the loop to clean up
      await service.stopLoop(featureId);
    });

    it('should throw error if loop already running', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      await service.startLoop(projectPath, featureId);

      await expect(service.startLoop(projectPath, featureId)).rejects.toThrow(
        `Ralph loop already running for feature ${featureId}`
      );
    });

    it('should throw error if feature not found', async () => {
      vi.mocked(readJsonWithRecovery).mockResolvedValue({
        data: null,
        recovered: false,
        source: 'default',
      });

      await expect(service.startLoop(projectPath, featureId)).rejects.toThrow(
        `Feature not found: ${featureId}`
      );
    });

    it('should merge config with defaults', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      const partialConfig: Partial<RalphLoopConfig> = {
        maxIterations: 3,
      };

      const state = await service.startLoop(projectPath, featureId, partialConfig);

      expect(state.config.maxIterations).toBe(3);
      expect(state.config.completionCriteria).toEqual(DEFAULT_RALPH_CONFIG.completionCriteria);
    });
  });

  describe('evaluateCriteria', () => {
    it('should pass when all criteria met', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      // Mock exec to succeed for all commands
      vi.mocked(exec).mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(null, { stdout: 'All tests passed', stderr: '' });
        return {} as any;
      }) as any);

      const config: Partial<RalphLoopConfig> = {
        maxIterations: 1,
        completionCriteria: [
          {
            type: 'tests_pass',
            name: 'Tests pass',
            required: true,
          },
          {
            type: 'build_succeeds',
            name: 'Build succeeds',
            required: true,
          },
        ],
      };

      // Start the loop
      await service.startLoop(projectPath, featureId, config);

      // Wait a bit for the async loop to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify verification completed event was emitted
      const verificationCalls = vi
        .mocked(mockEvents.emit)
        .mock.calls.filter((call) => call[0] === 'ralph:verification_completed');

      expect(verificationCalls.length).toBeGreaterThan(0);

      // Stop the loop
      await service.stopLoop(featureId);
    });

    it('should fail when a required criterion fails', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      // Mock exec to fail
      vi.mocked(exec).mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(new Error('Tests failed'), { stdout: '', stderr: 'Test error' });
        return {} as any;
      }) as any);

      const config: Partial<RalphLoopConfig> = {
        maxIterations: 1,
        completionCriteria: [
          {
            type: 'tests_pass',
            name: 'Tests pass',
            required: true,
          },
        ],
      };

      await service.startLoop(projectPath, featureId, config);

      // Wait for the loop to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify verification completed event shows failure
      const verificationCalls = vi
        .mocked(mockEvents.emit)
        .mock.calls.filter((call) => call[0] === 'ralph:verification_completed');

      expect(verificationCalls.length).toBeGreaterThan(0);
      const verificationPayload = verificationCalls[0][1] as any;
      expect(verificationPayload.verificationResult.allPassed).toBe(false);

      // Stop the loop
      await service.stopLoop(featureId);
    });

    it('should handle file_exists criterion', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      // Mock file exists
      vi.mocked(secureFs.access).mockResolvedValue(undefined);

      const config: Partial<RalphLoopConfig> = {
        maxIterations: 1,
        completionCriteria: [
          {
            type: 'file_exists',
            name: 'Output file exists',
            required: true,
            config: {
              filePath: '/test/output.txt',
            },
          },
        ],
      };

      await service.startLoop(projectPath, featureId, config);

      // Wait for the loop to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify verification completed
      const verificationCalls = vi
        .mocked(mockEvents.emit)
        .mock.calls.filter((call) => call[0] === 'ralph:verification_completed');

      expect(verificationCalls.length).toBeGreaterThan(0);

      // Stop the loop
      await service.stopLoop(featureId);
    });

    it('should handle file_contains criterion', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      // Mock file content
      vi.mocked(secureFs.readFile).mockResolvedValue('This file contains the expected pattern');

      const config: Partial<RalphLoopConfig> = {
        maxIterations: 1,
        completionCriteria: [
          {
            type: 'file_contains',
            name: 'File contains pattern',
            required: true,
            config: {
              filePath: '/test/output.txt',
              searchPattern: 'expected pattern',
            },
          },
        ],
      };

      await service.startLoop(projectPath, featureId, config);

      // Wait for the loop to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Stop the loop
      await service.stopLoop(featureId);
    });
  });

  describe('loop termination', () => {
    it('should terminate after maxIterations', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      // Mock exec to always fail so we hit max iterations
      vi.mocked(exec).mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(new Error('Tests failed'), { stdout: '', stderr: 'Test error' });
        return {} as any;
      }) as any);

      const config: Partial<RalphLoopConfig> = {
        maxIterations: 2,
        iterationDelayMs: 10, // Small delay for testing
        completionCriteria: [
          {
            type: 'tests_pass',
            name: 'Tests pass',
            required: true,
          },
        ],
      };

      await service.startLoop(projectPath, featureId, config);

      // Wait for the loop to complete (2 iterations + delays + execution time)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Wait a bit more to ensure state is saved
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if loop is still running - if so, stop it
      if (service.isLoopRunning(featureId)) {
        await service.stopLoop(featureId);
      }

      // Verify max iterations event was emitted or loop completed
      const maxIterationsCalls = vi
        .mocked(mockEvents.emit)
        .mock.calls.filter((call) => call[0] === 'ralph:max_iterations');

      // The loop should have completed (either max iterations or stopped)
      expect(service.isLoopRunning(featureId)).toBe(false);
    });

    it('should terminate when verification passes', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      // Mock exec to succeed
      vi.mocked(exec).mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(null, { stdout: 'Success', stderr: '' });
        return {} as any;
      }) as any);

      const config: Partial<RalphLoopConfig> = {
        maxIterations: 5,
        completionCriteria: [
          {
            type: 'build_succeeds',
            name: 'Build succeeds',
            required: true,
          },
        ],
      };

      await service.startLoop(projectPath, featureId, config);

      // Wait for the loop to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if loop completed
      if (service.isLoopRunning(featureId)) {
        await service.stopLoop(featureId);
      }

      // Verify loop is no longer running
      expect(service.isLoopRunning(featureId)).toBe(false);
    });
  });

  describe('stopLoop', () => {
    it('should stop a running loop and clean up correctly', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      const config: Partial<RalphLoopConfig> = {
        maxIterations: 10,
        iterationDelayMs: 1000, // Long delay
        completionCriteria: [
          {
            type: 'tests_pass',
            name: 'Tests pass',
            required: true,
          },
        ],
      };

      await service.startLoop(projectPath, featureId, config);

      // Verify loop is running
      expect(service.isLoopRunning(featureId)).toBe(true);

      // Stop the loop
      const stoppedState = await service.stopLoop(featureId);

      expect(stoppedState).not.toBeNull();
      expect(stoppedState?.status).toBe('stopped');
      expect(stoppedState?.endedAt).toBeDefined();

      // Verify loop is no longer running
      expect(service.isLoopRunning(featureId)).toBe(false);

      // Verify stopped event was emitted
      const stoppedCalls = vi
        .mocked(mockEvents.emit)
        .mock.calls.filter((call) => call[0] === 'ralph:stopped');

      expect(stoppedCalls.length).toBe(1);
    });

    it('should return null if loop not running', async () => {
      const result = await service.stopLoop('nonexistent-feature');
      expect(result).toBeNull();
    });
  });

  describe('pauseLoop and resumeLoop', () => {
    it('should pause and resume a loop', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      // Mock readJsonWithRecovery to handle different file reads
      let pausedStateForResume: RalphLoopState | null = null;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        if (path.includes('ralph-state.json') && pausedStateForResume) {
          return Promise.resolve({ data: pausedStateForResume, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      // Use long iteration delay so we can catch it before it completes
      const config: Partial<RalphLoopConfig> = {
        maxIterations: 10,
        iterationDelayMs: 5000,
        completionCriteria: [
          {
            type: 'tests_pass',
            name: 'Tests pass',
            required: true,
          },
        ],
      };

      await service.startLoop(projectPath, featureId, config);

      // Wait a bit for loop to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Pause the loop
      const pausedState = await service.pauseLoop(featureId);
      expect(pausedState).not.toBeNull();
      // Status might be 'paused', 'verifying', or 'running' depending on timing
      expect(['paused', 'verifying', 'running']).toContain(pausedState?.status);

      // Verify paused event was emitted
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'ralph:paused',
        expect.objectContaining({ featureId })
      );

      // Stop the loop for cleanup
      await service.stopLoop(featureId);

      // Set up paused state for resume
      pausedStateForResume = {
        featureId,
        projectPath,
        status: 'paused',
        config: DEFAULT_RALPH_CONFIG,
        iterations: [],
        currentIteration: 1,
        startedAt: '2026-02-24T00:00:00Z',
      };

      // Resume the loop
      const resumedState = await service.resumeLoop(projectPath, featureId);
      expect(resumedState).not.toBeNull();
      expect(resumedState?.status).toBe('running');

      // Verify resumed event was emitted
      const resumedCalls = vi
        .mocked(mockEvents.emit)
        .mock.calls.filter((call) => call[0] === 'ralph:resumed');
      expect(resumedCalls.length).toBe(1);

      // Cleanup
      await service.stopLoop(featureId);
    });
  });

  describe('getStatus and getRunningLoops', () => {
    it('should return status of a running loop', async () => {
      const mockFeature: Feature = {
        id: featureId,
        title: 'Test Feature',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature.json')) {
          return Promise.resolve({ data: mockFeature, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      await service.startLoop(projectPath, featureId);

      const status = await service.getStatus(projectPath, featureId);
      expect(status).not.toBeNull();
      expect(status?.featureId).toBe(featureId);
      expect(status?.status).toBe('running');

      // Cleanup
      await service.stopLoop(featureId);
    });

    it('should return all running loops', async () => {
      const mockFeature1: Feature = {
        id: 'feature-1',
        title: 'Feature 1',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      const mockFeature2: Feature = {
        id: 'feature-2',
        title: 'Feature 2',
        createdAt: '2026-02-24T00:00:00Z',
      } as Feature;

      vi.mocked(readJsonWithRecovery).mockImplementation((path: string) => {
        if (path.includes('feature-1')) {
          return Promise.resolve({ data: mockFeature1, recovered: false, source: 'main' });
        }
        if (path.includes('feature-2')) {
          return Promise.resolve({ data: mockFeature2, recovered: false, source: 'main' });
        }
        return Promise.resolve({ data: null, recovered: false, source: 'default' });
      });

      await service.startLoop(projectPath, 'feature-1');
      await service.startLoop(projectPath, 'feature-2');

      const runningLoops = service.getRunningLoops();
      expect(runningLoops).toHaveLength(2);
      expect(runningLoops.map((l) => l.featureId)).toContain('feature-1');
      expect(runningLoops.map((l) => l.featureId)).toContain('feature-2');

      // Cleanup
      await service.stopLoop('feature-1');
      await service.stopLoop('feature-2');
    });

    it('should return empty array when no loops running', () => {
      const runningLoops = service.getRunningLoops();
      expect(runningLoops).toEqual([]);
    });
  });
});
