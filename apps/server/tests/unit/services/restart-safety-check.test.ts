/**
 * Tests for the restart safety check logic in AutoModeService.
 *
 * Covers:
 * - checkRestartSafety: determines safe action for each in-progress feature on restart
 * - resumeInterruptedFeatures: uses safety check to prevent duplicate PRs / conflicting git state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';

// Mock child_process before any imports — execAsync = promisify(exec)
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));
// Make promisify a no-op so that execAsync(cmd, opts) calls exec(cmd, opts) directly.
// This lets us control execAsync return values via mockExec without callback plumbing.
vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return { ...actual, promisify: (fn: unknown) => fn };
});

// Mock secure-fs so filesystem calls are controlled in tests
vi.mock('@/lib/secure-fs.js', () => ({
  access: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  unlink: vi.fn(),
  existsSync: vi.fn(),
  stat: vi.fn(),
}));

// Mock @protolabsai/utils for readJsonWithRecovery
vi.mock('@protolabsai/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@protolabsai/utils')>();
  return {
    ...actual,
    readJsonWithRecovery: vi.fn(),
    logRecoveryWarning: vi.fn(),
  };
});

import { AutoModeService } from '@/services/auto-mode-service.js';
import { exec } from 'child_process';
import * as secureFs from '@/lib/secure-fs.js';
import { readJsonWithRecovery } from '@protolabsai/utils';

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;
const mockAccess = secureFs.access as unknown as ReturnType<typeof vi.fn>;
const mockReaddir = secureFs.readdir as unknown as ReturnType<typeof vi.fn>;
const mockReadJsonWithRecovery = readJsonWithRecovery as unknown as ReturnType<typeof vi.fn>;

const mockEvents = {
  subscribe: vi.fn(),
  emit: vi.fn(),
  on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  setCorrelationContext: vi.fn(),
  getCorrelationContext: vi.fn().mockReturnValue(undefined),
  clearCorrelationContext: vi.fn(),
};

const PROJECT_PATH = '/fake/project';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feature-001',
    title: 'Test Feature',
    description: 'A test feature',
    status: 'in_progress',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    order: 0,
    ...overrides,
  } as Feature;
}

describe('AutoModeService — restart safety check', () => {
  let service: AutoModeService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEvents.on.mockReturnValue({ unsubscribe: vi.fn() });
    service = new AutoModeService(mockEvents as any);
  });

  // ──────────────────────────────────────────────
  // checkRestartSafety — unit tests
  // ──────────────────────────────────────────────
  describe('checkRestartSafety', () => {
    describe('PR check (feature.prNumber is set)', () => {
      it('returns skip-review when PR is OPEN', async () => {
        mockExec.mockResolvedValueOnce({ stdout: 'OPEN\n', stderr: '' });

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ prNumber: 42 })
        );

        expect(result.action).toBe('skip-review');
        expect(result.reason).toContain('42');
      });

      it('returns skip-done when PR is MERGED', async () => {
        mockExec.mockResolvedValueOnce({ stdout: 'MERGED\n', stderr: '' });

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ prNumber: 42 })
        );

        expect(result.action).toBe('skip-done');
      });

      it('returns skip-review when PR is CLOSED', async () => {
        mockExec.mockResolvedValueOnce({ stdout: 'CLOSED\n', stderr: '' });

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ prNumber: 42 })
        );

        expect(result.action).toBe('skip-review');
      });

      it('returns skip-review (safe fallback) when gh CLI check fails', async () => {
        mockExec.mockRejectedValueOnce(new Error('command not found: gh'));

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ prNumber: 42 })
        );

        expect(result.action).toBe('skip-review');
        expect(result.reason).toContain('assumed open');
      });

      it('sanitises prNumber before using it in the shell command', async () => {
        mockExec.mockResolvedValueOnce({ stdout: 'OPEN\n', stderr: '' });

        await (service as any).checkRestartSafety(PROJECT_PATH, makeFeature({ prNumber: 123 }));

        // exec should have been called with the sanitised numeric string
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('123'), expect.any(Object));
      });
    });

    describe('worktree check (no prNumber, branchName is set)', () => {
      it('returns block when worktree has uncommitted changes', async () => {
        // access resolves — worktree directory exists
        mockAccess.mockResolvedValueOnce(undefined);
        // git status --porcelain reports modified file
        mockExec.mockResolvedValueOnce({ stdout: ' M src/index.ts\n', stderr: '' });

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ branchName: 'feature/my-branch' })
        );

        expect(result.action).toBe('block');
        expect(result.reason).toContain('uncommitted changes');
      });

      it('returns block when worktree has merge conflicts (UU marker)', async () => {
        mockAccess.mockResolvedValueOnce(undefined);
        mockExec.mockResolvedValueOnce({ stdout: 'UU src/conflicted.ts\n', stderr: '' });

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ branchName: 'feature/my-branch' })
        );

        expect(result.action).toBe('block');
        expect(result.reason).toContain('conflicts');
      });

      it('returns block when worktree has merge conflicts (AA marker)', async () => {
        mockAccess.mockResolvedValueOnce(undefined);
        mockExec.mockResolvedValueOnce({ stdout: 'AA new-file.ts\n', stderr: '' });

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ branchName: 'feature/my-branch' })
        );

        expect(result.action).toBe('block');
        expect(result.reason).toContain('conflicts');
      });

      it('returns resume when worktree is clean', async () => {
        mockAccess.mockResolvedValueOnce(undefined);
        mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' });

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ branchName: 'feature/my-branch' })
        );

        expect(result.action).toBe('resume');
      });

      it('returns resume when worktree directory does not exist (ENOENT)', async () => {
        const enoent = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
        mockAccess.mockRejectedValueOnce(enoent);

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ branchName: 'feature/my-branch' })
        );

        // No worktree means fresh start — safe to resume
        expect(result.action).toBe('resume');
      });

      it('returns block when git status command itself fails', async () => {
        mockAccess.mockResolvedValueOnce(undefined);
        mockExec.mockRejectedValueOnce(new Error('fatal: not a git repository'));

        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ branchName: 'feature/my-branch' })
        );

        expect(result.action).toBe('block');
        expect(result.reason).toContain('git status check failed');
      });

      it('sanitises branchName for the worktree path computation', async () => {
        const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        mockAccess.mockRejectedValueOnce(enoent);

        // Branch name with slashes — should be sanitised to dashes
        await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ branchName: 'feature/my-branch' })
        );

        // access should have been called with the sanitised path
        expect(mockAccess).toHaveBeenCalledWith(expect.stringContaining('feature-my-branch'));
      });
    });

    describe('no PR and no branchName', () => {
      it('returns resume immediately', async () => {
        const result = await (service as any).checkRestartSafety(
          PROJECT_PATH,
          makeFeature({ prNumber: undefined, branchName: undefined })
        );

        expect(result.action).toBe('resume');
        // Should not have called exec at all
        expect(mockExec).not.toHaveBeenCalled();
      });
    });
  });

  // ──────────────────────────────────────────────
  // resumeInterruptedFeatures — safety check integration
  // ──────────────────────────────────────────────
  describe('resumeInterruptedFeatures — safety check integration', () => {
    let checkSafetySpy: ReturnType<typeof vi.spyOn>;
    let featureLoaderUpdateSpy: ReturnType<typeof vi.spyOn>;
    let resumeFeatureSpy: ReturnType<typeof vi.spyOn>;

    function setupCrashScenario(feature: Feature) {
      // Reset the resumeCheckedProjects set so we can call the method multiple times
      (service as any).resumeCheckedProjects = new Set();

      // Execution state file exists → crash recovery mode
      mockAccess.mockResolvedValueOnce(undefined);

      // Features directory listing
      mockReaddir.mockResolvedValueOnce([{ isDirectory: () => true, name: feature.id }]);

      // Feature JSON load
      mockReadJsonWithRecovery.mockResolvedValueOnce({ data: feature, warnings: [] });

      // agent-output.md access — no context file (feature still added to interrupted list)
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockAccess.mockRejectedValueOnce(enoent);
    }

    beforeEach(() => {
      checkSafetySpy = vi
        .spyOn(service as any, 'checkRestartSafety')
        .mockResolvedValue({ action: 'resume' });

      featureLoaderUpdateSpy = vi
        .spyOn((service as any).featureLoader, 'update')
        .mockResolvedValue(undefined);

      resumeFeatureSpy = vi.spyOn(service as any, 'resumeFeature').mockResolvedValue(undefined);
    });

    it('marks feature as done when safety check returns skip-done', async () => {
      const feature = makeFeature({ id: 'feature-done', prNumber: 99 });
      setupCrashScenario(feature);
      checkSafetySpy.mockResolvedValueOnce({ action: 'skip-done' });

      await service.resumeInterruptedFeatures(PROJECT_PATH);

      expect(featureLoaderUpdateSpy).toHaveBeenCalledWith(
        PROJECT_PATH,
        'feature-done',
        expect.objectContaining({ status: 'done' })
      );
      expect(resumeFeatureSpy).not.toHaveBeenCalled();
    });

    it('marks feature as review when safety check returns skip-review', async () => {
      const feature = makeFeature({ id: 'feature-review', prNumber: 55 });
      setupCrashScenario(feature);
      checkSafetySpy.mockResolvedValueOnce({
        action: 'skip-review',
        reason: 'PR #55 is OPEN — not re-running',
      });

      await service.resumeInterruptedFeatures(PROJECT_PATH);

      expect(featureLoaderUpdateSpy).toHaveBeenCalledWith(
        PROJECT_PATH,
        'feature-review',
        expect.objectContaining({ status: 'review' })
      );
      expect(resumeFeatureSpy).not.toHaveBeenCalled();
    });

    it('marks feature as blocked when safety check returns block', async () => {
      const feature = makeFeature({ id: 'feature-blocked', branchName: 'feature/blocked' });
      setupCrashScenario(feature);
      checkSafetySpy.mockResolvedValueOnce({
        action: 'block',
        reason: 'Worktree has uncommitted changes (3 file(s))',
      });

      await service.resumeInterruptedFeatures(PROJECT_PATH);

      expect(featureLoaderUpdateSpy).toHaveBeenCalledWith(
        PROJECT_PATH,
        'feature-blocked',
        expect.objectContaining({
          status: 'blocked',
          statusChangeReason: expect.stringContaining('uncommitted changes'),
        })
      );
      expect(resumeFeatureSpy).not.toHaveBeenCalled();
    });

    it('calls resumeFeature when safety check returns resume', async () => {
      const feature = makeFeature({ id: 'feature-safe' });
      setupCrashScenario(feature);
      checkSafetySpy.mockResolvedValueOnce({ action: 'resume' });

      await service.resumeInterruptedFeatures(PROJECT_PATH);

      expect(resumeFeatureSpy).toHaveBeenCalledWith(PROJECT_PATH, 'feature-safe', true);
      expect(featureLoaderUpdateSpy).not.toHaveBeenCalled();
    });

    it('does not call resumeFeature without first running the safety check', async () => {
      const feature = makeFeature({ id: 'feature-checked' });
      setupCrashScenario(feature);
      checkSafetySpy.mockResolvedValueOnce({ action: 'resume' });

      await service.resumeInterruptedFeatures(PROJECT_PATH);

      // Safety check must have been called before resume
      expect(checkSafetySpy).toHaveBeenCalledWith(
        PROJECT_PATH,
        expect.objectContaining({ id: 'feature-checked' })
      );
      const safetyCallOrder = checkSafetySpy.mock.invocationCallOrder[0];
      const resumeCallOrder = resumeFeatureSpy.mock.invocationCallOrder[0];
      expect(safetyCallOrder).toBeLessThan(resumeCallOrder);
    });

    it('does not resume features that were not in a crash scenario (clean stop)', async () => {
      const feature = makeFeature({ id: 'feature-clean-stop' });

      // Reset so method runs again
      (service as any).resumeCheckedProjects = new Set();

      // No execution state file → clean stop (NOT a crash)
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockAccess.mockRejectedValueOnce(enoent);

      // Features directory listing
      mockReaddir.mockResolvedValueOnce([{ isDirectory: () => true, name: feature.id }]);

      // Feature JSON load
      mockReadJsonWithRecovery.mockResolvedValueOnce({ data: feature, warnings: [] });

      // updateFeatureStatus spy (used for backlog reset on clean stop)
      const updateStatusSpy = vi
        .spyOn(service as any, 'updateFeatureStatus')
        .mockResolvedValue(undefined);

      await service.resumeInterruptedFeatures(PROJECT_PATH);

      // On clean stop: feature is reset to backlog, NOT resumed
      expect(updateStatusSpy).toHaveBeenCalledWith(PROJECT_PATH, 'feature-clean-stop', 'backlog');
      expect(checkSafetySpy).not.toHaveBeenCalled();
      expect(resumeFeatureSpy).not.toHaveBeenCalled();
    });
  });
});
