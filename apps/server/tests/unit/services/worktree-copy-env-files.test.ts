/**
 * Unit tests for .env file copying during worktree creation.
 *
 * Verifies that:
 * - .env* files from the main repo root are copied to new worktrees
 * - .env.example files are NOT copied
 * - Copying is skipped when copyEnvToWorktrees is false
 * - Copying proceeds (default true) when setting is absent
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
const mockExecFileAsync = vi.hoisted(() => vi.fn(async () => ({ stdout: '', stderr: '' })));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const execFn = vi.fn();
  (execFn as any)[Symbol.for('nodejs.util.promisify.custom')] = mockExecAsync;
  const execFileFn = vi.fn();
  (execFileFn as any)[Symbol.for('nodejs.util.promisify.custom')] = mockExecFileAsync;
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

// securefs mock - controls readdir/readFile/writeFile for env file copy tests
const mockReaddir = vi.hoisted(() => vi.fn(async () => []));
const mockReadFile = vi.hoisted(() => vi.fn(async () => Buffer.from('')));
const mockWriteFile = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/lib/secure-fs.js', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: vi.fn(async () => undefined),
  existsSync: vi.fn(() => false),
  readdir: mockReaddir,
  access: vi.fn(async () => undefined),
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

function makeDirent(name: string) {
  return {
    name,
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
  };
}

function makeService(gitWorkflowOverride?: { copyEnvToWorktrees?: boolean }) {
  const events = {
    subscribe: vi.fn(),
    emit: vi.fn(),
    on: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  };
  const settingsService =
    gitWorkflowOverride !== undefined
      ? {
          getGlobalSettings: vi.fn(async () => ({
            gitWorkflow: gitWorkflowOverride,
          })),
          getProjectSettings: vi.fn(async () => ({})),
        }
      : undefined;
  return new AutoModeService(events as any, settingsService as any);
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-env-copy-test',
    title: 'Env Copy Test Feature',
    description: 'Test env file copying',
    status: 'backlog',
    branchName: 'feature/env-test',
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

const PROJECT_PATH = '/tmp/test-project';
const BRANCH_NAME = 'feature/env-test';

describe('AutoModeService - copyEnvFilesToWorktree', () => {
  beforeEach(() => {
    vi.stubEnv('AUTOMAKER_MOCK_AGENT', 'true');
    mockExecAsync.mockReset();
    mockExecFileAsync.mockReset();
    mockGetEffectivePrBaseBranch.mockResolvedValue('dev');
    mockReaddir.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();

    // Default: branch doesn't exist → triggers worktree add -B
    mockExecFileAsync.mockImplementation(async (_bin: string, args: string[]) => {
      if (args.includes('rev-parse') && args.includes('--verify')) {
        throw new Error('unknown revision');
      }
      return { stdout: '', stderr: '' };
    });

    // Default exec mock (for git rev-parse --git-dir after worktree creation)
    mockExecAsync.mockResolvedValue({ stdout: '.git', stderr: '' });
  });

  it('copies .env and .env.local to new worktree by default', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('.env'),
      makeDirent('.env.local'),
      makeDirent('.env.example'),
    ]);
    mockReadFile.mockResolvedValue(Buffer.from('KEY=value'));

    const svc = makeService(); // no settingsService → defaults to true
    await (svc as any).createWorktreeForBranch(PROJECT_PATH, BRANCH_NAME, makeFeature());

    // readFile should be called for .env and .env.local but NOT .env.example
    const readFileCalls = mockReadFile.mock.calls.map((c) => c[0] as string);
    expect(readFileCalls.some((p) => p.endsWith('.env'))).toBe(true);
    expect(readFileCalls.some((p) => p.endsWith('.env.local'))).toBe(true);
    expect(readFileCalls.some((p) => p.endsWith('.env.example'))).toBe(false);

    // writeFile should be called for .env and .env.local
    const writeFileCalls = mockWriteFile.mock.calls.map((c) => c[0] as string);
    expect(writeFileCalls.some((p) => p.endsWith('.env'))).toBe(true);
    expect(writeFileCalls.some((p) => p.endsWith('.env.local'))).toBe(true);
  });

  it('does NOT copy .env.example files', async () => {
    mockReaddir.mockResolvedValue([makeDirent('.env.example')]);

    const svc = makeService();
    await (svc as any).createWorktreeForBranch(PROJECT_PATH, BRANCH_NAME, makeFeature());

    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('skips env file copy when copyEnvToWorktrees is false', async () => {
    mockReaddir.mockResolvedValue([makeDirent('.env'), makeDirent('.env.local')]);

    const svc = makeService({ copyEnvToWorktrees: false });
    await (svc as any).createWorktreeForBranch(PROJECT_PATH, BRANCH_NAME, makeFeature());

    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('copies env files when copyEnvToWorktrees is explicitly true', async () => {
    mockReaddir.mockResolvedValue([makeDirent('.env')]);
    mockReadFile.mockResolvedValue(Buffer.from('KEY=value'));

    const svc = makeService({ copyEnvToWorktrees: true });
    await (svc as any).createWorktreeForBranch(PROJECT_PATH, BRANCH_NAME, makeFeature());

    expect(mockReadFile).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('does not copy anything when project has no .env files', async () => {
    mockReaddir.mockResolvedValue([makeDirent('package.json'), makeDirent('tsconfig.json')]);

    const svc = makeService();
    await (svc as any).createWorktreeForBranch(PROJECT_PATH, BRANCH_NAME, makeFeature());

    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('continues (non-fatal) when copying an env file fails', async () => {
    mockReaddir.mockResolvedValue([makeDirent('.env'), makeDirent('.env.local')]);
    // First readFile succeeds, second throws
    mockReadFile
      .mockResolvedValueOnce(Buffer.from('KEY=value'))
      .mockRejectedValueOnce(new Error('permission denied'));

    const svc = makeService();
    // Should not throw even though second file copy fails
    await expect(
      (svc as any).createWorktreeForBranch(PROJECT_PATH, BRANCH_NAME, makeFeature())
    ).resolves.not.toThrow();

    // Warn should have been logged
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
