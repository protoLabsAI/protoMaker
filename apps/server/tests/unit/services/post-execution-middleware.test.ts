import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const mockCheckAndRecoverUncommittedWork = vi.hoisted(() => vi.fn());
const mockRemoveLock = vi.hoisted(() => vi.fn(async () => {}));
const mockActiveAgentsCount = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('@protolabsai/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@protolabsai/utils')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
  };
});

vi.mock('@/services/worktree-recovery-service.js', () => ({
  checkAndRecoverUncommittedWork: mockCheckAndRecoverUncommittedWork,
}));

vi.mock('@/lib/worktree-lock.js', () => ({
  removeLock: mockRemoveLock,
}));

vi.mock('@/lib/prometheus.js', () => ({
  activeAgentsCount: mockActiveAgentsCount,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { PostExecutionMiddleware } from '@/services/auto-mode/post-execution-middleware.js';
import type { PostExecutionContext } from '@/services/auto-mode/post-execution-middleware.js';
import type { RunningFeature } from '@/services/auto-mode/execution-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feature-test-001',
    title: 'Test Feature',
    description: 'A test feature',
    status: 'in_progress',
    branchName: 'feature/test-branch',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    order: 0,
    ...overrides,
  };
}

function makeRunningFeature(worktreePath: string | null = '/mock/worktree'): RunningFeature {
  return {
    featureId: 'feature-test-001',
    projectPath: '/mock/project',
    worktreePath,
    branchName: 'feature/test-branch',
    abortController: new AbortController(),
    isAutoMode: true,
    startTime: Date.now(),
    retryCount: 0,
    previousErrors: [],
  };
}

function makeContext(overrides: Partial<PostExecutionContext> = {}): PostExecutionContext {
  const tempRunningFeature = makeRunningFeature();
  const runningFeatures = new Map<string, RunningFeature>();
  runningFeatures.set('feature-test-001', tempRunningFeature);

  return {
    featureId: 'feature-test-001',
    projectPath: '/mock/project',
    feature: makeFeature(),
    tempRunningFeature,
    runningFeatures,
    abortController: new AbortController(),
    getAutoLoopRunning: () => false,
    saveExecutionState: vi.fn(async () => {}),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PostExecutionMiddleware', () => {
  let middleware: PostExecutionMiddleware;

  beforeEach(() => {
    vi.clearAllMocks();
    middleware = new PostExecutionMiddleware();
  });

  describe('run — uncommitted work safety net', () => {
    it('is a no-op when worktree is clean (detected=false)', async () => {
      mockCheckAndRecoverUncommittedWork.mockResolvedValueOnce({
        detected: false,
        recovered: false,
      });

      const updateFeatureStatus = vi.fn(async () => {});
      const emitEvent = vi.fn();
      const ctx = makeContext({ updateFeatureStatus, emitEvent });

      await middleware.run(ctx);

      expect(mockCheckAndRecoverUncommittedWork).toHaveBeenCalledOnce();
      // No status update or event when worktree was already clean
      expect(updateFeatureStatus).not.toHaveBeenCalled();
      expect(emitEvent).not.toHaveBeenCalled();
    });

    it('updates feature status to review and emits event on successful recovery', async () => {
      mockCheckAndRecoverUncommittedWork.mockResolvedValueOnce({
        detected: true,
        recovered: true,
        prUrl: 'https://github.com/owner/repo/pull/42',
        prNumber: 42,
        prCreatedAt: '2024-01-01T00:00:00Z',
      });

      const updateFeatureStatus = vi.fn(async () => {});
      const emitEvent = vi.fn();
      const ctx = makeContext({ updateFeatureStatus, emitEvent });

      await middleware.run(ctx);

      expect(updateFeatureStatus).toHaveBeenCalledWith(
        '/mock/project',
        'feature-test-001',
        'review'
      );

      expect(emitEvent).toHaveBeenCalledWith('auto_mode_recovery_pr_created', {
        featureId: 'feature-test-001',
        projectPath: '/mock/project',
        prUrl: 'https://github.com/owner/repo/pull/42',
        prNumber: 42,
        prCreatedAt: '2024-01-01T00:00:00Z',
      });
    });

    it('emits recovery_failed event when detection succeeds but recovery fails', async () => {
      mockCheckAndRecoverUncommittedWork.mockResolvedValueOnce({
        detected: true,
        recovered: false,
        error: 'git push failed: remote rejected',
      });

      const updateFeatureStatus = vi.fn(async () => {});
      const emitEvent = vi.fn();
      const ctx = makeContext({ updateFeatureStatus, emitEvent });

      await middleware.run(ctx);

      // Status should NOT be updated when recovery fails
      expect(updateFeatureStatus).not.toHaveBeenCalled();

      expect(emitEvent).toHaveBeenCalledWith('auto_mode_recovery_failed', {
        featureId: 'feature-test-001',
        projectPath: '/mock/project',
        error: 'git push failed: remote rejected',
      });
    });

    it('does not throw when updateFeatureStatus rejects', async () => {
      mockCheckAndRecoverUncommittedWork.mockResolvedValueOnce({
        detected: true,
        recovered: true,
        prUrl: 'https://github.com/owner/repo/pull/7',
        prNumber: 7,
        prCreatedAt: '2024-01-01T00:00:00Z',
      });

      const updateFeatureStatus = vi.fn(async () => {
        throw new Error('database write failed');
      });
      const emitEvent = vi.fn();
      const ctx = makeContext({ updateFeatureStatus, emitEvent });

      // Must not throw — middleware swallows all errors
      await expect(middleware.run(ctx)).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("failed to update feature status to 'review'"),
        expect.any(Error)
      );
    });

    it('skips safety net and status update when feature is null', async () => {
      const updateFeatureStatus = vi.fn(async () => {});
      const emitEvent = vi.fn();
      const ctx = makeContext({ feature: null, updateFeatureStatus, emitEvent });

      await middleware.run(ctx);

      expect(mockCheckAndRecoverUncommittedWork).not.toHaveBeenCalled();
      expect(updateFeatureStatus).not.toHaveBeenCalled();
      expect(emitEvent).not.toHaveBeenCalled();
    });

    it('skips safety net when worktreePath is null', async () => {
      const updateFeatureStatus = vi.fn(async () => {});
      const emitEvent = vi.fn();
      const tempRunningFeature = makeRunningFeature(null);
      const runningFeatures = new Map<string, RunningFeature>();
      runningFeatures.set('feature-test-001', tempRunningFeature);

      const ctx = makeContext({
        tempRunningFeature,
        runningFeatures,
        updateFeatureStatus,
        emitEvent,
      });

      await middleware.run(ctx);

      expect(mockCheckAndRecoverUncommittedWork).not.toHaveBeenCalled();
      expect(updateFeatureStatus).not.toHaveBeenCalled();
      expect(emitEvent).not.toHaveBeenCalled();
    });

    it('still completes cleanup steps even when recovery check throws', async () => {
      mockCheckAndRecoverUncommittedWork.mockRejectedValueOnce(new Error('unexpected git error'));

      const ctx = makeContext();

      // Must not throw
      await expect(middleware.run(ctx)).resolves.toBeUndefined();

      // Cleanup steps still run: lock removed and feature removed from map
      expect(mockRemoveLock).toHaveBeenCalledWith('/mock/worktree');
      expect(ctx.runningFeatures.size).toBe(0);
    });

    it('works correctly when optional callbacks are not provided', async () => {
      mockCheckAndRecoverUncommittedWork.mockResolvedValueOnce({
        detected: true,
        recovered: true,
        prUrl: 'https://github.com/owner/repo/pull/99',
        prNumber: 99,
        prCreatedAt: '2024-01-01T00:00:00Z',
      });

      // No updateFeatureStatus or emitEvent provided
      const ctx = makeContext();

      // Must not throw when optional callbacks are absent
      await expect(middleware.run(ctx)).resolves.toBeUndefined();
    });
  });

  describe('run — cleanup steps always execute', () => {
    beforeEach(() => {
      mockCheckAndRecoverUncommittedWork.mockResolvedValue({
        detected: false,
        recovered: false,
      });
    });

    it('aborts the agent abort controller', async () => {
      const ctx = makeContext();
      const abortSpy = vi.spyOn(ctx.abortController, 'abort');

      await middleware.run(ctx);

      expect(abortSpy).toHaveBeenCalled();
    });

    it('removes worktree lock', async () => {
      const ctx = makeContext();

      await middleware.run(ctx);

      expect(mockRemoveLock).toHaveBeenCalledWith('/mock/worktree');
    });

    it('removes feature from runningFeatures map', async () => {
      const ctx = makeContext();
      expect(ctx.runningFeatures.has('feature-test-001')).toBe(true);

      await middleware.run(ctx);

      expect(ctx.runningFeatures.has('feature-test-001')).toBe(false);
    });

    it('saves execution state when auto loop is running', async () => {
      const saveExecutionState = vi.fn(async () => {});
      const ctx = makeContext({
        getAutoLoopRunning: () => true,
        saveExecutionState,
      });

      await middleware.run(ctx);

      expect(saveExecutionState).toHaveBeenCalledWith('/mock/project');
    });

    it('skips execution state save when auto loop is not running', async () => {
      const saveExecutionState = vi.fn(async () => {});
      const ctx = makeContext({
        getAutoLoopRunning: () => false,
        saveExecutionState,
      });

      await middleware.run(ctx);

      expect(saveExecutionState).not.toHaveBeenCalled();
    });
  });
});
