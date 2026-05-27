import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionState } from '@protolabsai/types';

// Keep platform real except for ensureAutomakerDir, which would mkdir on the real
// filesystem. getExecutionStatePath stays real so spied reads/writes hit the same
// path the service computes.
vi.mock('@protolabsai/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@protolabsai/platform')>();
  return { ...actual, ensureAutomakerDir: vi.fn().mockResolvedValue(undefined) };
});

import { AutoModeService } from '@/services/auto-mode-service.js';
import * as secureFs from '@/lib/secure-fs.js';
import { getExecutionStatePath } from '@protolabsai/platform';

const mockEvents = {
  subscribe: vi.fn(),
  emit: vi.fn(),
  on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  setCorrelationContext: vi.fn(),
  getCorrelationContext: vi.fn().mockReturnValue(undefined),
  clearCorrelationContext: vi.fn(),
};

function makeState(overrides: Partial<ExecutionState>): ExecutionState {
  return {
    version: 1,
    autoLoopWasRunning: true,
    maxConcurrency: 8,
    projectPath: '/proj',
    branchName: null,
    runningFeatureIds: [],
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

function enoent(): NodeJS.ErrnoException {
  const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

describe('auto-mode resume across restart (#3949)', () => {
  let service: AutoModeService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEvents.on.mockReturnValue({ unsubscribe: vi.fn() });
    service = new AutoModeService(mockEvents as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listResumableLoops', () => {
    it('resumes loops that were running, carrying the saved maxConcurrency', async () => {
      const running = '/proj/running';
      const branchRunning = '/proj/branch-running';
      const stopped = '/proj/stopped';
      const missing = '/proj/missing';

      vi.spyOn(secureFs, 'readFile').mockImplementation(async (p: unknown) => {
        if (p === getExecutionStatePath(running)) {
          return JSON.stringify(makeState({ projectPath: running, maxConcurrency: 8 }));
        }
        if (p === getExecutionStatePath(branchRunning)) {
          return JSON.stringify(
            makeState({ projectPath: branchRunning, branchName: 'feature/x', maxConcurrency: 3 })
          );
        }
        if (p === getExecutionStatePath(stopped)) {
          // File present but loop was not running (e.g. cleanly stopped state shape).
          return JSON.stringify(
            makeState({ projectPath: stopped, autoLoopWasRunning: false, maxConcurrency: 5 })
          );
        }
        throw enoent();
      });

      const result = await service.listResumableLoops([running, branchRunning, stopped, missing]);

      expect(result).toEqual([
        { projectPath: running, branchName: null, maxConcurrency: 8 },
        { projectPath: branchRunning, branchName: 'feature/x', maxConcurrency: 3 },
      ]);
    });

    it('dedupes repeated candidate paths and ignores missing state files', async () => {
      const running = '/proj/running';
      const readSpy = vi.spyOn(secureFs, 'readFile').mockImplementation(async (p: unknown) => {
        if (p === getExecutionStatePath(running)) {
          return JSON.stringify(makeState({ projectPath: running, maxConcurrency: 4 }));
        }
        throw enoent();
      });

      const result = await service.listResumableLoops([running, running, '/proj/none']);

      expect(result).toEqual([{ projectPath: running, branchName: null, maxConcurrency: 4 }]);
      // Deduped: the repeated path is read at most once.
      expect(readSpy).toHaveBeenCalledTimes(2);
    });

    it('returns nothing when no project has persisted state', async () => {
      vi.spyOn(secureFs, 'readFile').mockRejectedValue(enoent());
      const result = await service.listResumableLoops(['/a', '/b']);
      expect(result).toEqual([]);
    });
  });

  describe('saveExecutionState snapshot refresh', () => {
    it('preserves configured maxConcurrency, branchName, and running flag from disk', async () => {
      const projectPath = '/proj/keep';
      const existing = makeState({
        projectPath,
        branchName: 'feature/keep',
        maxConcurrency: 8,
        autoLoopWasRunning: true,
        runningFeatureIds: ['old'],
        savedAt: '2026-01-01T00:00:00.000Z',
      });

      vi.spyOn(secureFs, 'readFile').mockResolvedValue(JSON.stringify(existing) as never);
      const writeSpy = vi.spyOn(secureFs, 'writeFile').mockResolvedValue(undefined as never);

      // Private snapshot-refresh hook invoked via the post-execution callback path.
      await (
        service as unknown as { saveExecutionState(p: string): Promise<void> }
      ).saveExecutionState(projectPath);

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const written = JSON.parse(writeSpy.mock.calls[0][1] as string) as ExecutionState;
      expect(written.maxConcurrency).toBe(8);
      expect(written.branchName).toBe('feature/keep');
      expect(written.autoLoopWasRunning).toBe(true);
      // The volatile timestamp is refreshed, not preserved.
      expect(written.savedAt).not.toBe(existing.savedAt);
    });

    it('falls back to defaults when no prior state file exists', async () => {
      vi.spyOn(secureFs, 'readFile').mockRejectedValue(enoent());
      const writeSpy = vi.spyOn(secureFs, 'writeFile').mockResolvedValue(undefined as never);

      await (
        service as unknown as { saveExecutionState(p: string): Promise<void> }
      ).saveExecutionState('/proj/fresh');

      const written = JSON.parse(writeSpy.mock.calls[0][1] as string) as ExecutionState;
      expect(written.branchName).toBeNull();
      expect(written.maxConcurrency).toBeGreaterThanOrEqual(1);
    });
  });
});
