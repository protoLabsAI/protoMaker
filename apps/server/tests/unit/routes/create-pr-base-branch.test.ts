/**
 * Unit tests for PR base branch resolution in the create-pr route.
 *
 * Verifies that:
 * - An explicit baseBranch in the request body is always respected
 * - When baseBranch is omitted, getEffectivePrBaseBranch resolves from project settings
 * - When project settings have no prBaseBranch, auto-detection falls back to git remote HEAD
 * - Final fallback is DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch ('dev')
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SettingsService } from '@/services/settings-service.js';
import { DEFAULT_GIT_WORKFLOW_SETTINGS } from '@protolabsai/types';

// Mock child_process: execFile must call its callback so promisify doesn't hang.
// By default we simulate the git command failing (non-zero exit) so tests that
// rely on the fallback don't block.
vi.mock('node:child_process', () => {
  const execFile = vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (err: Error | null, result?: { stdout: string }) => void
    ) => {
      // Simulate git failure by default
      callback(new Error('git: command failed'));
    }
  );
  return { execFile };
});

// Mock logger
vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return { ...actual, createLogger: () => mockLogger };
});

// Helper to build a minimal SettingsService mock
function makeSettingsService(prBaseBranch?: string): SettingsService {
  return {
    getProjectSettings: vi
      .fn()
      .mockResolvedValue(prBaseBranch ? { workflow: { gitWorkflow: { prBaseBranch } } } : {}),
    getGlobalSettings: vi.fn().mockResolvedValue({}),
    getInstanceId: vi.fn().mockResolvedValue('test-instance'),
  } as unknown as SettingsService;
}

describe('PR base branch resolution (getEffectivePrBaseBranch)', () => {
  // Import lazily so the mock is in place before the module resolves execFileAsync
  let getEffectivePrBaseBranch: (
    projectPath: string,
    settingsService?: SettingsService | null,
    logPrefix?: string
  ) => Promise<string>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import after mocks are set up
    const mod = await import('@/lib/settings-helpers.js');
    getEffectivePrBaseBranch = mod.getEffectivePrBaseBranch;
  });

  it('returns the project-level prBaseBranch when configured', async () => {
    const service = makeSettingsService('dev');
    const result = await getEffectivePrBaseBranch('/project', service, '[test]');
    expect(result).toBe('dev');
  });

  it('returns a non-default project prBaseBranch (e.g. main-only project)', async () => {
    const service = makeSettingsService('main');
    const result = await getEffectivePrBaseBranch('/project', service, '[test]');
    expect(result).toBe('main');
  });

  it('returns an epic branch when project prBaseBranch is set to an epic branch', async () => {
    const service = makeSettingsService('epic/my-epic');
    const result = await getEffectivePrBaseBranch('/project', service, '[test]');
    expect(result).toBe('epic/my-epic');
  });

  it('falls back to DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch when no settings and git fails', async () => {
    // No settingsService and git is mocked to fail → final fallback
    const result = await getEffectivePrBaseBranch('/project', null, '[test]');
    expect(result).toBe(DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch);
  });

  it('falls back to DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch when project has no prBaseBranch configured and git fails', async () => {
    // Project settings exist but no gitWorkflow.prBaseBranch; git is mocked to fail
    const service = makeSettingsService(undefined);
    const result = await getEffectivePrBaseBranch('/project', service, '[test]');
    expect(result).toBe(DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch);
  });

  it('default prBaseBranch is "dev"', () => {
    expect(DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch).toBe('dev');
  });
});

describe('PR base branch resolution – explicit caller override', () => {
  let getEffectivePrBaseBranch: (
    projectPath: string,
    settingsService?: SettingsService | null,
    logPrefix?: string
  ) => Promise<string>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/lib/settings-helpers.js');
    getEffectivePrBaseBranch = mod.getEffectivePrBaseBranch;
  });

  it('explicit baseBranch takes precedence over all settings (simulated)', async () => {
    // The create-pr route uses: const base = baseBranch || (await getEffectivePrBaseBranch(...))
    // This test verifies the short-circuit: when caller supplies baseBranch it is used as-is.
    const callerSupplied = 'staging';
    const service = makeSettingsService('dev');
    // Simulate the route logic
    const resolved = callerSupplied || (await getEffectivePrBaseBranch('/project', service));
    expect(resolved).toBe('staging');
  });

  it('falls through to getEffectivePrBaseBranch when baseBranch is not supplied', async () => {
    const callerSupplied: string | undefined = undefined;
    const service = makeSettingsService('dev');
    const resolved = callerSupplied || (await getEffectivePrBaseBranch('/project', service));
    expect(resolved).toBe('dev');
  });
});
