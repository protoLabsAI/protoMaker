import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SpecGenerationMonitor,
  resetSpecGenerationMonitor,
} from '@/services/spec-generation-monitor.js';
import { createEventEmitter, type EventEmitter } from '@/lib/events.js';
import * as common from '@/routes/app-spec/common.js';

// Mock the common module
vi.mock('@/routes/app-spec/common.js', () => ({
  getSpecRegenerationStatus: vi.fn(),
  setRunningState: vi.fn(),
}));

describe('spec-generation-monitor.ts', () => {
  let events: EventEmitter;
  let monitor: SpecGenerationMonitor;
  let mockAbortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    events = createEventEmitter();
    mockAbortController = new AbortController();
  });

  afterEach(() => {
    if (monitor) {
      monitor.stopMonitoring();
    }
    resetSpecGenerationMonitor();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a monitor with default config', () => {
      monitor = new SpecGenerationMonitor(events);
      expect(monitor).toBeDefined();
      expect(monitor.isMonitoring()).toBe(false);
    });

    it('should create a monitor with custom config', () => {
      monitor = new SpecGenerationMonitor(events, {
        checkIntervalMs: 10000,
        stallThresholdMs: 60000,
        enabled: false,
      });
      expect(monitor).toBeDefined();
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring when enabled', () => {
      monitor = new SpecGenerationMonitor(events);
      monitor.startMonitoring();
      expect(monitor.isMonitoring()).toBe(true);
    });

    it('should not start monitoring when disabled', () => {
      monitor = new SpecGenerationMonitor(events, { enabled: false });
      monitor.startMonitoring();
      expect(monitor.isMonitoring()).toBe(false);
    });

    it('should not start monitoring if already running', () => {
      monitor = new SpecGenerationMonitor(events);
      monitor.startMonitoring();
      const firstStart = monitor.isMonitoring();
      monitor.startMonitoring();
      expect(monitor.isMonitoring()).toBe(firstStart);
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring', () => {
      monitor = new SpecGenerationMonitor(events);
      monitor.startMonitoring();
      expect(monitor.isMonitoring()).toBe(true);
      monitor.stopMonitoring();
      expect(monitor.isMonitoring()).toBe(false);
    });

    it('should handle stopping when not running', () => {
      monitor = new SpecGenerationMonitor(events);
      expect(monitor.isMonitoring()).toBe(false);
      monitor.stopMonitoring();
      expect(monitor.isMonitoring()).toBe(false);
    });
  });

  describe('tick and cleanup', () => {
    it('should not cleanup a job that is not stalled', async () => {
      const projectPath = '/test/project';

      // Mock status as running
      vi.mocked(common.getSpecRegenerationStatus).mockReturnValue({
        isRunning: true,
        currentAbortController: mockAbortController,
        projectPath,
      });

      monitor = new SpecGenerationMonitor(events, {
        checkIntervalMs: 1000,
        stallThresholdMs: 10000,
      });

      // Emit an event to track activity
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        projectPath,
      });

      monitor.startMonitoring();

      // Wait for one tick
      await vi.advanceTimersByTimeAsync(1000);

      // Should not cleanup because job is not stalled yet
      expect(common.setRunningState).not.toHaveBeenCalled();
    });

    it('should cleanup a stalled job', async () => {
      const projectPath = '/test/project';
      const emitSpy = vi.fn();
      events.subscribe(emitSpy);

      // Mock status as running
      vi.mocked(common.getSpecRegenerationStatus).mockReturnValue({
        isRunning: true,
        currentAbortController: mockAbortController,
        projectPath,
      });

      monitor = new SpecGenerationMonitor(events, {
        checkIntervalMs: 1000,
        stallThresholdMs: 5000, // 5 seconds threshold
      });

      // Emit an event to track activity
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        projectPath,
      });

      monitor.startMonitoring();

      // Wait for the job to become stalled (5 seconds + 1 second check interval)
      await vi.advanceTimersByTimeAsync(6000);

      // Should cleanup the stalled job
      expect(common.setRunningState).toHaveBeenCalledWith(projectPath, false, null);

      // Should emit error event
      expect(emitSpy).toHaveBeenCalledWith(
        'spec-regeneration:event',
        expect.objectContaining({
          type: 'spec_regeneration_error',
          error: 'Generation timed out after 5 minutes of inactivity',
          projectPath,
        })
      );
    });

    it('should abort the AbortController when cleaning up a stalled job', async () => {
      const projectPath = '/test/project';
      const abortSpy = vi.spyOn(mockAbortController, 'abort');

      // Mock status as running with abort controller
      vi.mocked(common.getSpecRegenerationStatus).mockReturnValue({
        isRunning: true,
        currentAbortController: mockAbortController,
        projectPath,
      });

      monitor = new SpecGenerationMonitor(events, {
        checkIntervalMs: 1000,
        stallThresholdMs: 5000,
      });

      // Emit an event to track activity
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        projectPath,
      });

      monitor.startMonitoring();

      // Wait for the job to become stalled
      await vi.advanceTimersByTimeAsync(6000);

      // Should abort the controller
      expect(abortSpy).toHaveBeenCalled();
    });

    it('should handle multiple projects independently', async () => {
      const project1 = '/test/project1';
      const project2 = '/test/project2';

      monitor = new SpecGenerationMonitor(events, {
        checkIntervalMs: 1000,
        stallThresholdMs: 5000,
      });

      // Track activity for both projects
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        projectPath: project1,
      });
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        projectPath: project2,
      });

      // Mock status for both projects
      vi.mocked(common.getSpecRegenerationStatus).mockImplementation((path) => ({
        isRunning: true,
        currentAbortController: mockAbortController,
        projectPath: path,
      }));

      monitor.startMonitoring();

      // Project1 becomes stalled
      await vi.advanceTimersByTimeAsync(6000);

      // Both should be cleaned up
      expect(common.setRunningState).toHaveBeenCalledWith(project1, false, null);
      expect(common.setRunningState).toHaveBeenCalledWith(project2, false, null);
    });

    it('should remove project from tracking when job is no longer running', async () => {
      const projectPath = '/test/project';

      monitor = new SpecGenerationMonitor(events, {
        checkIntervalMs: 1000,
        stallThresholdMs: 5000,
      });

      // Emit an event to track activity
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        projectPath,
      });

      // Mock status as running initially, then not running for subsequent calls
      vi.mocked(common.getSpecRegenerationStatus).mockImplementation(() => ({
        isRunning: false,
        currentAbortController: null,
        projectPath,
      }));

      // Override for first call only
      vi.mocked(common.getSpecRegenerationStatus).mockReturnValueOnce({
        isRunning: true,
        currentAbortController: mockAbortController,
        projectPath,
      });

      monitor.startMonitoring();

      // First tick - job is running
      await vi.advanceTimersByTimeAsync(1000);

      // Second tick - job is no longer running, should be removed from tracking
      await vi.advanceTimersByTimeAsync(1000);

      // Third tick - should not try to cleanup since it was removed
      await vi.advanceTimersByTimeAsync(1000);

      // Should not call setRunningState since the job was already not running
      expect(common.setRunningState).not.toHaveBeenCalled();
    });

    it('should continue checking other projects if one cleanup fails', async () => {
      const project1 = '/test/project1';
      const project2 = '/test/project2';

      monitor = new SpecGenerationMonitor(events, {
        checkIntervalMs: 1000,
        stallThresholdMs: 5000,
      });

      // Track activity for both projects
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        projectPath: project1,
      });
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        projectPath: project2,
      });

      // Mock status for both projects
      vi.mocked(common.getSpecRegenerationStatus).mockImplementation((path) => ({
        isRunning: true,
        currentAbortController: mockAbortController,
        projectPath: path,
      }));

      // Make the first cleanup fail
      vi.mocked(common.setRunningState).mockImplementationOnce(() => {
        throw new Error('Cleanup failed');
      });

      monitor.startMonitoring();

      // Wait for both to become stalled
      await vi.advanceTimersByTimeAsync(6000);

      // Both should be attempted to cleanup even though first failed
      expect(common.setRunningState).toHaveBeenCalledTimes(2);
      expect(common.setRunningState).toHaveBeenCalledWith(project1, false, null);
      expect(common.setRunningState).toHaveBeenCalledWith(project2, false, null);
    });
  });

  describe('activity tracking', () => {
    it('should update last activity timestamp on spec-regeneration events', async () => {
      const projectPath = '/test/project';

      vi.mocked(common.getSpecRegenerationStatus).mockReturnValue({
        isRunning: true,
        currentAbortController: mockAbortController,
        projectPath,
      });

      monitor = new SpecGenerationMonitor(events, {
        checkIntervalMs: 1000,
        stallThresholdMs: 5000,
      });

      // Emit initial event
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        projectPath,
      });

      monitor.startMonitoring();

      // Wait 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      // Emit another event to update activity
      events.emit('spec-regeneration:event', {
        type: 'spec_regeneration_progress',
        projectPath,
      });

      // Wait another 3 seconds (total 6 seconds from initial, but only 3 from last activity)
      await vi.advanceTimersByTimeAsync(3000);

      // Should not cleanup because last activity was only 3 seconds ago
      expect(common.setRunningState).not.toHaveBeenCalled();
    });

    it('should only track events with projectPath', async () => {
      const projectPath = '/test/project';

      monitor = new SpecGenerationMonitor(events, {
        checkIntervalMs: 1000,
        stallThresholdMs: 5000,
      });

      // Emit event without projectPath
      events.emit('spec-regeneration:event', {
        type: 'spec_progress',
        content: 'test',
      });

      monitor.startMonitoring();

      // Wait for stall threshold
      await vi.advanceTimersByTimeAsync(6000);

      // Should not attempt cleanup because no project was tracked
      expect(common.setRunningState).not.toHaveBeenCalled();
    });
  });
});
