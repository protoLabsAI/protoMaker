/**
 * feature-scheduler-concurrency.test.ts
 *
 * Unit tests for FeatureScheduler.resolveMaxConcurrency()
 *
 * Verifies the documented precedence chain:
 *   1. AUTOMAKER_MAX_CONCURRENCY env var → MAX_SYSTEM_CONCURRENCY (hard cap)
 *   2. settings.systemMaxConcurrency (UI-configurable system cap)
 *   3. autoModeByWorktree[key].maxConcurrency (per-project)
 *   4. settings.maxConcurrency (global default)
 *   5. DEFAULT_MAX_CONCURRENCY = 1 (code fallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module-level mocks (hoisted before imports) ─────────────────────────────

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: vi.fn(),
    execFile: vi.fn(),
  };
});

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: (fn: unknown) => fn,
  };
});

vi.mock('@/lib/secure-fs.js', () => ({
  readdir: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
  copyFile: vi.fn(),
  unlink: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/utils')>('@protolabsai/utils');
  return {
    ...actual,
    readJsonWithRecovery: vi.fn(),
    logRecoveryWarning: vi.fn(),
    atomicWriteJson: vi.fn().mockResolvedValue(undefined),
    recordMemoryUsage: vi.fn(),
    appendLearning: vi.fn(),
  };
});

// Override MAX_SYSTEM_CONCURRENCY to 10 so tests can exercise the full precedence chain
// without hitting the default env-var cap of 2.
vi.mock('@protolabsai/types', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/types')>('@protolabsai/types');
  return {
    ...actual,
    MAX_SYSTEM_CONCURRENCY: 10,
  };
});

vi.mock('@protolabsai/platform', async () => {
  const actual =
    await vi.importActual<typeof import('@protolabsai/platform')>('@protolabsai/platform');
  return {
    ...actual,
    getFeaturesDir: vi.fn().mockReturnValue('/fake/project/.automaker/features'),
    getAutomakerDir: vi.fn().mockReturnValue('/fake/project/.automaker'),
    getFeatureDir: vi.fn().mockReturnValue('/fake/project/.automaker/features/feature-001'),
    ensureAutomakerDir: vi.fn().mockResolvedValue(undefined),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  FeatureScheduler,
  type PipelineRunner,
  type SchedulerCallbacks,
} from '@/services/feature-scheduler.js';
import { DEFAULT_MAX_CONCURRENCY, MAX_SYSTEM_CONCURRENCY } from '@protolabsai/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScheduler(settingsService: object | null): FeatureScheduler {
  return new FeatureScheduler({
    featureLoader: { get: vi.fn(), getAll: vi.fn() } as never,
    settingsService: settingsService as never,
    events: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as never,
    runner: vi.fn() as unknown as PipelineRunner,
    callbacks: {} as SchedulerCallbacks,
  });
}

function makeSettingsService(overrides: {
  maxConcurrency?: number;
  systemMaxConcurrency?: number;
  projectId?: string;
  perProjectMaxConcurrency?: number;
  branchName?: string | null;
}) {
  const { maxConcurrency, systemMaxConcurrency, projectId, perProjectMaxConcurrency, branchName } =
    overrides;

  const autoModeByWorktree: Record<string, { maxConcurrency: number }> = {};
  if (projectId !== undefined && perProjectMaxConcurrency !== undefined) {
    const key = `${projectId}::${branchName ?? '__main__'}`;
    autoModeByWorktree[key] = { maxConcurrency: perProjectMaxConcurrency };
  }

  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      maxConcurrency,
      systemMaxConcurrency,
      projects: projectId ? [{ id: projectId, path: '/fake/project', name: 'Test Project' }] : [],
      autoModeByWorktree,
    }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FeatureScheduler.resolveMaxConcurrency', () => {
  const PROJECT_PATH = '/fake/project';
  const PROJECT_ID = 'proj-abc';

  it('returns DEFAULT_MAX_CONCURRENCY when no settingsService is provided', async () => {
    const scheduler = makeScheduler(null);
    const result = await scheduler.resolveMaxConcurrency(PROJECT_PATH, null);
    expect(result).toBe(DEFAULT_MAX_CONCURRENCY);
  });

  it('returns global maxConcurrency when no per-project setting exists', async () => {
    const settings = makeSettingsService({ maxConcurrency: 3 });
    const scheduler = makeScheduler(settings);
    const result = await scheduler.resolveMaxConcurrency(PROJECT_PATH, null);
    expect(result).toBe(3);
  });

  it('returns DEFAULT_MAX_CONCURRENCY when global maxConcurrency is not set', async () => {
    const settings = makeSettingsService({});
    const scheduler = makeScheduler(settings);
    const result = await scheduler.resolveMaxConcurrency(PROJECT_PATH, null);
    expect(result).toBe(DEFAULT_MAX_CONCURRENCY);
  });

  it('prefers per-project setting over global (step 3 > step 4)', async () => {
    const settings = makeSettingsService({
      maxConcurrency: 2,
      projectId: PROJECT_ID,
      perProjectMaxConcurrency: 4,
      branchName: null,
    });
    const scheduler = makeScheduler(settings);
    const result = await scheduler.resolveMaxConcurrency(PROJECT_PATH, null);
    expect(result).toBe(4);
  });

  it('respects branchName in per-project key', async () => {
    const settings = makeSettingsService({
      maxConcurrency: 2,
      projectId: PROJECT_ID,
      perProjectMaxConcurrency: 5,
      branchName: 'feature/my-branch',
    });
    const scheduler = makeScheduler(settings);

    // Requesting with the right branch returns per-project value
    const resultWithBranch = await scheduler.resolveMaxConcurrency(
      PROJECT_PATH,
      'feature/my-branch'
    );
    expect(resultWithBranch).toBe(5);

    // Requesting with a different branch falls back to global
    const resultOtherBranch = await scheduler.resolveMaxConcurrency(PROJECT_PATH, '__main__');
    expect(resultOtherBranch).toBe(2);
  });

  it('caps at systemMaxConcurrency when desired exceeds it (step 2)', async () => {
    const settings = makeSettingsService({
      maxConcurrency: 8,
      systemMaxConcurrency: 3,
    });
    const scheduler = makeScheduler(settings);
    const result = await scheduler.resolveMaxConcurrency(PROJECT_PATH, null);
    expect(result).toBe(3);
  });

  it('caps systemMaxConcurrency at MAX_SYSTEM_CONCURRENCY (step 1)', async () => {
    const settings = makeSettingsService({
      maxConcurrency: MAX_SYSTEM_CONCURRENCY + 5,
      systemMaxConcurrency: MAX_SYSTEM_CONCURRENCY + 5,
    });
    const scheduler = makeScheduler(settings);
    const result = await scheduler.resolveMaxConcurrency(PROJECT_PATH, null);
    expect(result).toBe(MAX_SYSTEM_CONCURRENCY);
  });

  it('caps per-project value at systemMaxConcurrency', async () => {
    const settings = makeSettingsService({
      maxConcurrency: 2,
      systemMaxConcurrency: 3,
      projectId: PROJECT_ID,
      perProjectMaxConcurrency: 10,
      branchName: null,
    });
    const scheduler = makeScheduler(settings);
    const result = await scheduler.resolveMaxConcurrency(PROJECT_PATH, null);
    expect(result).toBe(3);
  });

  it('returns DEFAULT_MAX_CONCURRENCY when settings.getGlobalSettings throws', async () => {
    const settings = {
      getGlobalSettings: vi.fn().mockRejectedValue(new Error('settings unavailable')),
    };
    const scheduler = makeScheduler(settings);
    const result = await scheduler.resolveMaxConcurrency(PROJECT_PATH, null);
    expect(result).toBe(DEFAULT_MAX_CONCURRENCY);
  });

  it('does not exceed MAX_SYSTEM_CONCURRENCY regardless of settings', async () => {
    const settings = makeSettingsService({
      maxConcurrency: 999,
    });
    const scheduler = makeScheduler(settings);
    const result = await scheduler.resolveMaxConcurrency(PROJECT_PATH, null);
    expect(result).toBeLessThanOrEqual(MAX_SYSTEM_CONCURRENCY);
  });
});
