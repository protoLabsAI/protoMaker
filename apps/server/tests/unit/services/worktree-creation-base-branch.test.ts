/**
 * Unit tests for worktree creation base branch resolution.
 *
 * Verifies that createWorktreeForBranch uses the project's configured
 * prBaseBranch instead of the hardcoded 'origin/dev'.
 *
 * AC:
 * - Worktree creation with prBaseBranch 'main' runs `git worktree add ... origin/main`
 * - Worktree creation with prBaseBranch 'dev' (default) runs `git worktree add ... origin/dev`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoModeService } from '@/services/auto-mode-service.js';
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

const mockExecAsync = vi.hoisted(() => vi.fn(async () => ({ stdout: '', stderr: '' })));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const execFn = vi.fn();
  (execFn as any)[Symbol.for('nodejs.util.promisify.custom')] = mockExecAsync;
  const execFileFn = vi.fn();
  (execFileFn as any)[Symbol.for('nodejs.util.promisify.custom')] = vi.fn(async () => ({
    stdout: '',
    stderr: '',
  }));
  return { ...actual, exec: execFn, execFile: execFileFn };
});

const mockGetEffectivePrBaseBranch = vi.hoisted(() => vi.fn(async () => 'dev'));

vi.mock('@/lib/settings-helpers.js', () => ({
  getWorkflowSettings: vi.fn(async () => ({})),
  getEffectivePrBaseBranch: mockGetEffectivePrBaseBranch,
  getAutoLoadClaudeMdSetting: vi.fn(async () => false),
  filterClaudeMdFromContext: vi.fn(() => ''),
  getMCPServersFromSettings: vi.fn(async () => []),
  getPromptCustomization: vi.fn(async () => ({
    taskExecution: {
      implementationInstructions: 'Implement the feature.',
      playwrightVerificationInstructions: 'Write tests.',
      continuationAfterApprovalTemplate: '{{approvedPlan}} {{userFeedback}}',
    },
    autoMode: {
      planningLite: '',
      planningLiteWithApproval: '',
      planningSpec: '',
      planningFull: '',
    },
  })),
  getProviderByModelId: vi.fn(async () => null),
  getPhaseModelWithOverrides: vi.fn(async () => ({
    phaseModel: { model: '' },
    isProjectOverride: false,
  })),
}));

vi.mock('@protolabsai/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@protolabsai/utils')>();
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    loadContextFiles: vi.fn(async () => ({ formattedPrompt: '', memoryFiles: [] })),
    classifyError: vi.fn((err: unknown) => ({
      type: 'execution',
      message: err instanceof Error ? err.message : 'Unknown error',
      isAbort: false,
      isAuth: false,
      isCancellation: false,
      isRateLimit: false,
      isQuotaExhausted: false,
      originalError: err,
    })),
    appendLearning: vi.fn(async () => {}),
    recordMemoryUsage: vi.fn(async () => {}),
    buildPromptWithImages: vi.fn(async (prompt: string) => prompt),
    atomicWriteJson: vi.fn(async () => {}),
    readJsonWithRecovery: vi.fn(async () => ({})),
    logRecoveryWarning: vi.fn(),
    DEFAULT_BACKUP_COUNT: 3,
  };
});

vi.mock('@protolabsai/error-tracking', () => ({ setFeatureContext: vi.fn() }));

vi.mock('@protolabsai/git-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@protolabsai/git-utils')>();
  return {
    ...actual,
    rebaseWorktreeOnMain: vi.fn(async () => ({ success: true })),
    extractTitleFromDescription:
      actual.extractTitleFromDescription ??
      vi.fn((desc: string) => {
        if (!desc?.trim()) return 'Untitled Feature';
        const first = desc.split('\n')[0].trim();
        return first.length > 72
          ? first.substring(0, 69) + '...'
          : first || 'Feature implementation';
      }),
  };
});

vi.mock('@protolabsai/platform', () => ({
  getFeatureDir: vi.fn((_p: string, id: string) => `/tmp/test/.automaker/features/${id}`),
  getAutomakerDir: vi.fn(() => `/tmp/test/.automaker`),
  getFeaturesDir: vi.fn(() => `/tmp/test/.automaker/features`),
  getExecutionStatePath: vi.fn(() => `/tmp/test/.automaker/execution-state.json`),
  ensureAutomakerDir: vi.fn(async () => {}),
  getWorktreePath: vi.fn((p: string, b: string) => `${p}/.worktrees/${b}`),
}));

vi.mock('@/lib/secure-fs.js', () => ({
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  existsSync: vi.fn(() => false),
}));

vi.mock('@/lib/worktree-guard.js', () => ({ ensureCleanWorktree: vi.fn(async () => {}) }));
vi.mock('@/lib/prometheus.js', () => ({
  agentCostTotal: { inc: vi.fn() },
  agentExecutionDuration: { observe: vi.fn() },
  activeAgentsCount: { set: vi.fn() },
  agentTokensInputTotal: { inc: vi.fn() },
  agentTokensOutputTotal: { inc: vi.fn() },
  agentExecutionsTotal: { inc: vi.fn() },
}));
vi.mock('@/lib/sdk-options.js', () => ({
  validateWorkingDirectory: vi.fn(),
  createAutoModeOptions: vi.fn(() => ({})),
  createCustomOptions: vi.fn(() => ({})),
}));
vi.mock('@/services/agent-manifest-service.js', () => ({
  getAgentManifestService: vi.fn(() => ({
    getAgent: vi.fn(async () => undefined),
    matchFeature: vi.fn(async () => null),
  })),
}));
vi.mock('@/services/notification-service.js', () => ({
  getNotificationService: vi.fn(() => null),
}));
vi.mock('@/services/recovery-service.js', () => ({
  RecoveryService: vi.fn(),
  getRecoveryService: vi.fn(() => null),
}));
vi.mock('@/services/git-workflow-service.js', () => ({
  gitWorkflowService: {
    saveAgentProgress: vi.fn(async () => null),
    runGitWorkflow: vi.fn(async () => null),
  },
}));
vi.mock('@/services/pipeline-service.js', () => ({
  pipelineService: { getPipelineConfig: vi.fn(async () => null) },
}));
vi.mock('@/providers/provider-factory.js', () => ({
  ProviderFactory: {
    getProviderNameForModel: vi.fn(() => 'claude'),
    modelSupportsVision: vi.fn(() => true),
  },
}));
vi.mock('@/providers/simple-query-service.js', () => ({ simpleQuery: vi.fn(async () => '') }));
vi.mock('@/services/stream-observer-service.js', () => ({
  StreamObserver: vi.fn().mockImplementation(() => ({ observe: vi.fn(), stop: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService() {
  const events = {
    subscribe: vi.fn(),
    emit: vi.fn(),
    on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  };
  return new AutoModeService(events as any);
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-worktree-test',
    title: 'Worktree Test Feature',
    description: 'Test worktree base branch',
    status: 'backlog',
    branchName: 'feature/test-branch',
    skipTests: true,
    planningMode: 'skip',
    requirePlanApproval: false,
    failureCount: 0,
    ...overrides,
  } as Feature;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoModeService - createWorktreeForBranch base branch resolution', () => {
  const PROJECT_PATH = '/tmp/test-project';
  const BRANCH_NAME = 'feature/test-branch';

  beforeEach(() => {
    vi.stubEnv('AUTOMAKER_MOCK_AGENT', 'true');
    mockExecAsync.mockReset();
    mockGetEffectivePrBaseBranch.mockReset();
  });

  it('uses origin/dev when prBaseBranch is "dev" (default)', async () => {
    mockGetEffectivePrBaseBranch.mockResolvedValue('dev');

    // git rev-parse --verify throws → branch doesn't exist → triggers worktree add
    mockExecAsync.mockImplementation(async (cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('rev-parse --verify')) {
        throw new Error('unknown revision');
      }
      return { stdout: '', stderr: '' };
    });

    const svc = makeService();
    await (svc as any).createWorktreeForBranch(PROJECT_PATH, BRANCH_NAME, makeFeature());

    const commands: string[] = mockExecAsync.mock.calls.map(([cmd]) => cmd as string);
    const worktreeAdd = commands.find((c) => c.includes('git worktree add') && c.includes('-b'));
    expect(worktreeAdd).toBeDefined();
    expect(worktreeAdd).toContain('origin/dev');
    expect(worktreeAdd).not.toContain('origin/main');
  });

  it('uses origin/main when prBaseBranch is "main" (e.g. GitHub-only project)', async () => {
    mockGetEffectivePrBaseBranch.mockResolvedValue('main');

    // git rev-parse --verify throws → branch doesn't exist → triggers worktree add
    mockExecAsync.mockImplementation(async (cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('rev-parse --verify')) {
        throw new Error('unknown revision');
      }
      return { stdout: '', stderr: '' };
    });

    const svc = makeService();
    await (svc as any).createWorktreeForBranch(PROJECT_PATH, BRANCH_NAME, makeFeature());

    const commands: string[] = mockExecAsync.mock.calls.map(([cmd]) => cmd as string);
    const worktreeAdd = commands.find((c) => c.includes('git worktree add') && c.includes('-b'));
    expect(worktreeAdd).toBeDefined();
    expect(worktreeAdd).toContain('origin/main');
    expect(worktreeAdd).not.toContain('origin/dev');
  });

  it('skips getEffectivePrBaseBranch when branch already exists (uses existing branch checkout)', async () => {
    mockGetEffectivePrBaseBranch.mockResolvedValue('main');

    // git rev-parse --verify succeeds → branch exists → uses `git worktree add <path> <branch>` (no -b)
    mockExecAsync.mockResolvedValue({ stdout: 'abc123', stderr: '' });

    const svc = makeService();
    await (svc as any).createWorktreeForBranch(PROJECT_PATH, BRANCH_NAME, makeFeature());

    const commands: string[] = mockExecAsync.mock.calls.map(([cmd]) => cmd as string);
    const allWorktreeAdds = commands.filter((c) => c.includes('git worktree add'));
    expect(allWorktreeAdds).toHaveLength(1);
    // The existing-branch form does not use the -b <branchname> flag or origin/
    // Use regex to avoid false positives from branch names like "feature-test-branch" containing "-b"
    expect(allWorktreeAdds[0]).not.toMatch(/\s-b\s/);
    expect(allWorktreeAdds[0]).not.toContain('origin/');
    // getEffectivePrBaseBranch is only called in the new-branch path, so it should NOT be called here
    expect(mockGetEffectivePrBaseBranch).not.toHaveBeenCalled();
  });
});
