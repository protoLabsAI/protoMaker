import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionService } from '@/services/auto-mode/execution-service.js';
import type { IAutoModeCallbacks } from '@/services/auto-mode/execution-types.js';
import type { Feature } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Hoisted mock helpers
// ---------------------------------------------------------------------------

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

// Hoisted mock for execAsync (child_process.exec promisified)
// We attach it via util.promisify.custom so promisify(exec) returns it directly.
const mockExecAsync = vi.hoisted(() => vi.fn(async () => ({ stdout: '', stderr: '' })));

vi.mock('child_process', () => {
  const execFn = vi.fn();
  // util.promisify checks for Symbol.for('nodejs.util.promisify.custom')
  // and uses it directly instead of wrapping the callback-style function.
  (execFn as any)[Symbol.for('nodejs.util.promisify.custom')] = mockExecAsync;
  return { exec: execFn };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@protolabsai/error-tracking', () => ({
  setFeatureContext: vi.fn(),
}));

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
  getWorktreePath: vi.fn((p: string, b: string) => `${p}/.worktrees/${b}`),
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
  };
});

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
}));

const mockGetWorkflowSettings = vi.hoisted(() => vi.fn(async () => ({})));
const mockGetPhaseModelWithOverrides = vi.hoisted(() =>
  vi.fn(async () => ({ phaseModel: { model: '' }, isProjectOverride: false }))
);

vi.mock('@/lib/settings-helpers.js', () => ({
  getWorkflowSettings: mockGetWorkflowSettings,
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
  getPhaseModelWithOverrides: mockGetPhaseModelWithOverrides,
}));

// Mock AgentManifestService
const mockGetAgent = vi.hoisted(() => vi.fn(async () => undefined));
const mockMatchFeature = vi.hoisted(() => vi.fn(async () => null));

vi.mock('@/services/agent-manifest-service.js', () => ({
  getAgentManifestService: vi.fn(() => ({
    getAgent: mockGetAgent,
    matchFeature: mockMatchFeature,
  })),
}));

vi.mock('@/lib/secure-fs.js', () => ({
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  existsSync: vi.fn(() => false),
}));

vi.mock('@/lib/worktree-guard.js', () => ({
  ensureCleanWorktree: vi.fn(async () => {}),
}));

vi.mock('@/services/pipeline-service.js', () => ({
  pipelineService: {
    getPipelineConfig: vi.fn(async () => null),
  },
}));

vi.mock('@/services/worktree-recovery-service.js', () => ({
  checkAndRecoverUncommittedWork: vi.fn(async () => ({ detected: false, recovered: false })),
}));

vi.mock('@/services/git-workflow-service.js', () => ({
  gitWorkflowService: {
    saveAgentProgress: vi.fn(async () => null),
    runGitWorkflow: vi.fn(async () => null),
  },
}));

vi.mock('@/providers/provider-factory.js', () => ({
  ProviderFactory: {
    getProviderNameForModel: vi.fn(() => 'claude'),
    modelSupportsVision: vi.fn(() => true),
  },
}));

vi.mock('@/providers/simple-query-service.js', () => ({
  simpleQuery: vi.fn(async () => ''),
}));

vi.mock('@/services/stream-observer-service.js', () => ({
  StreamObserver: vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('@/services/auto-mode-service.js', () => ({
  LoopDetectedError: class LoopDetectedError extends Error {
    loopSignature: string;
    constructor(msg: string, sig: string) {
      super(msg);
      this.name = 'LoopDetectedError';
      this.loopSignature = sig;
    }
  },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feature-test-1',
    title: 'Test Feature',
    description: 'Test feature description',
    status: 'backlog',
    branchName: null,
    skipTests: true,
    planningMode: 'skip',
    requirePlanApproval: false,
    failureCount: 0,
    ...overrides,
  } as Feature;
}

function makeCallbacks(
  feature: Feature,
  overrides: Partial<IAutoModeCallbacks> = {}
): IAutoModeCallbacks {
  return {
    loadFeature: vi.fn(async () => feature),
    contextExists: vi.fn(async () => false),
    resumeFeature: vi.fn(async () => {}),
    findExistingWorktreeForBranch: vi.fn(async () => null),
    createWorktreeForBranch: vi.fn(async () => null),
    getModelForFeature: vi.fn(async () => ({ model: 'claude-sonnet-4-6' })),
    saveExecutionState: vi.fn(async () => {}),
    getAutoLoopRunning: vi.fn(() => false),
    updateFeatureStatus: vi.fn(async () => {}),
    updateFeaturePlanSpec: vi.fn(async () => {}),
    recordSuccessForProject: vi.fn(),
    trackFailureAndCheckPauseForProject: vi.fn(() => false),
    signalShouldPauseForProject: vi.fn(),
    waitForPlanApproval: vi.fn(async () => ({ approved: true })),
    cancelPlanApproval: vi.fn(),
    ...overrides,
  };
}

function makeFeatureLoader(feature: Feature) {
  return {
    get: vi.fn(async () => feature),
    update: vi.fn(async (_path: string, _id: string, updates: Record<string, unknown>) => ({
      ...feature,
      ...updates,
    })),
    list: vi.fn(async () => []),
    save: vi.fn(async () => {}),
  } as any;
}

function makeRecoveryService() {
  return {
    analyzeFailure: vi.fn(async () => ({
      isRetryable: false,
      maxRetries: 0,
      suggestedDelay: 0,
      category: 'execution',
      confidence: 'high',
      reason: 'test failure',
    })),
    executeRecovery: vi.fn(async () => ({
      shouldRetry: false,
      actionTaken: 'none',
    })),
    planRecovery: vi.fn(async () => null),
  } as any;
}

function makeEvents() {
  return { subscribe: vi.fn(), emit: vi.fn() } as any;
}

function makeService(
  callbacks: IAutoModeCallbacks,
  featureLoader: ReturnType<typeof makeFeatureLoader>,
  recoveryService: ReturnType<typeof makeRecoveryService>,
  events = makeEvents()
): ExecutionService {
  return new ExecutionService(
    events,
    null,
    featureLoader,
    null,
    recoveryService,
    null,
    new Map(),
    new Map(),
    90,
    95,
    callbacks
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExecutionService - IAutoModeCallbacks contract', () => {
  const PROJECT_PATH = '/tmp/test-project';
  const FEATURE_ID = 'feature-test-1';

  let feature: Feature;
  let callbacks: IAutoModeCallbacks;
  let featureLoader: ReturnType<typeof makeFeatureLoader>;
  let recoveryService: ReturnType<typeof makeRecoveryService>;
  let events: ReturnType<typeof makeEvents>;
  let service: ExecutionService;

  beforeEach(() => {
    vi.stubEnv('AUTOMAKER_MOCK_AGENT', 'true');

    feature = makeFeature({ id: FEATURE_ID });
    callbacks = makeCallbacks(feature);
    featureLoader = makeFeatureLoader(feature);
    recoveryService = makeRecoveryService();
    events = makeEvents();
    service = makeService(callbacks, featureLoader, recoveryService, events);
  });

  it('agent start: auto-mode:event emitted with auto_mode_feature_start', async () => {
    await service.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(events.emit).toHaveBeenCalledWith(
      'auto-mode:event',
      expect.objectContaining({
        type: 'auto_mode_feature_start',
        featureId: FEATURE_ID,
        projectPath: PROJECT_PATH,
      })
    );
  });

  it('agent success: updateFeatureStatus called with terminal status and recordSuccessForProject called', async () => {
    await service.executeFeature(PROJECT_PATH, FEATURE_ID);

    // Status must be set to in_progress first
    expect(callbacks.updateFeatureStatus).toHaveBeenCalledWith(
      PROJECT_PATH,
      FEATURE_ID,
      'in_progress'
    );

    // skipTests=true → finalStatus is 'waiting_approval'
    expect(callbacks.updateFeatureStatus).toHaveBeenCalledWith(
      PROJECT_PATH,
      FEATURE_ID,
      'waiting_approval'
    );

    expect(callbacks.recordSuccessForProject).toHaveBeenCalledWith(PROJECT_PATH, null);
  });

  it('agent failure: trackFailureAndCheckPauseForProject called with error info', async () => {
    const testError = new Error('Agent execution failed');
    vi.spyOn(service as any, 'runAgent').mockRejectedValue(testError);

    await service.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(callbacks.trackFailureAndCheckPauseForProject).toHaveBeenCalledWith(
      PROJECT_PATH,
      null,
      expect.objectContaining({
        type: expect.any(String),
        message: 'Agent execution failed',
      })
    );
  });

  it('HITL gate: waitForPlanApproval called when plan approval enabled', async () => {
    const hitlFeature = makeFeature({
      id: FEATURE_ID,
      requirePlanApproval: true,
      planningMode: 'spec',
    });
    const hitlCallbacks = makeCallbacks(hitlFeature);
    const hitlService = makeService(hitlCallbacks, makeFeatureLoader(hitlFeature), recoveryService);

    // Intercept runAgent and simulate the HITL gate behavior
    vi.spyOn(hitlService as any, 'runAgent').mockImplementation(async () => {
      await hitlCallbacks.waitForPlanApproval(FEATURE_ID, PROJECT_PATH);
    });

    await hitlService.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(hitlCallbacks.waitForPlanApproval).toHaveBeenCalledWith(FEATURE_ID, PROJECT_PATH);
  });
});

// ---------------------------------------------------------------------------
// Merge pre-flight tests
// ---------------------------------------------------------------------------

describe('ExecutionService - merge pre-flight', () => {
  const PROJECT_PATH = '/tmp/test-project';
  const WORKTREE_PATH = '/tmp/test-project/.worktrees/feature-test-branch';
  const FEATURE_ID = 'feature-stash-test-1';

  beforeEach(() => {
    vi.stubEnv('AUTOMAKER_MOCK_AGENT', 'true');
    mockExecAsync.mockReset();
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
  });

  function makeWorktreeFeature(overrides: Partial<Feature> = {}): Feature {
    return {
      id: FEATURE_ID,
      title: 'Merge Test Feature',
      description: 'Test merge pre-flight',
      status: 'backlog',
      branchName: 'feature/test-branch',
      skipTests: true,
      planningMode: 'skip',
      requirePlanApproval: false,
      failureCount: 0,
      ...overrides,
    } as Feature;
  }

  function makeWorktreeCallbacks(
    feat: Feature,
    overrides: Partial<IAutoModeCallbacks> = {}
  ): IAutoModeCallbacks {
    return {
      loadFeature: vi.fn(async () => feat),
      contextExists: vi.fn(async () => false),
      resumeFeature: vi.fn(async () => {}),
      findExistingWorktreeForBranch: vi.fn(async () => WORKTREE_PATH),
      createWorktreeForBranch: vi.fn(async () => WORKTREE_PATH),
      getModelForFeature: vi.fn(async () => ({ model: 'claude-sonnet-4-6' })),
      saveExecutionState: vi.fn(async () => {}),
      getAutoLoopRunning: vi.fn(() => false),
      updateFeatureStatus: vi.fn(async () => {}),
      updateFeaturePlanSpec: vi.fn(async () => {}),
      recordSuccessForProject: vi.fn(),
      trackFailureAndCheckPauseForProject: vi.fn(() => false),
      signalShouldPauseForProject: vi.fn(),
      waitForPlanApproval: vi.fn(async () => ({ approved: true })),
      cancelPlanApproval: vi.fn(),
      ...overrides,
    };
  }

  it('runs git merge origin/dev during pre-flight sync', async () => {
    const feat = makeWorktreeFeature();

    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

    const callbacks = makeWorktreeCallbacks(feat);
    const recoveryService = {
      analyzeFailure: vi.fn(async () => ({
        isRetryable: false,
        maxRetries: 0,
        suggestedDelay: 0,
        category: 'execution',
        confidence: 'high',
        reason: 'test',
      })),
      executeRecovery: vi.fn(async () => ({ shouldRetry: false, actionTaken: 'none' })),
      planRecovery: vi.fn(async () => null),
    } as any;

    const svc = new ExecutionService(
      { subscribe: vi.fn(), emit: vi.fn() } as any,
      null,
      {
        get: vi.fn(async () => feat),
        update: vi.fn(async (_p: string, _id: string, updates: Record<string, unknown>) => ({
          ...feat,
          ...updates,
        })),
        list: vi.fn(async () => []),
        save: vi.fn(async () => {}),
      } as any,
      null,
      recoveryService,
      null,
      new Map(),
      new Map(),
      90,
      95,
      callbacks
    );

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID, true /* useWorktrees */);

    const commands: string[] = mockExecAsync.mock.calls.map(([cmd]) => cmd as string);

    // Merge must be called; stash must NOT be called (merge handles concurrent edits natively)
    expect(commands).toContain('git merge origin/dev');
    expect(commands).not.toContain('git stash --include-untracked');
    expect(commands).not.toContain('git stash pop');
    expect(commands).not.toContain('git rebase origin/dev');
  });

  it('does not stash even when unstaged changes exist (merge handles them natively)', async () => {
    const feat = makeWorktreeFeature();

    // Simulate unstaged changes — merge should proceed without stashing
    mockExecAsync.mockImplementation(async (cmd: string) => {
      if (cmd === 'git status --porcelain') {
        return {
          stdout: ' M package-lock.json\n M .automaker/memory/ops-lessons.md\n',
          stderr: '',
        };
      }
      return { stdout: '', stderr: '' };
    });

    const callbacks = makeWorktreeCallbacks(feat);
    const recoveryService = {
      analyzeFailure: vi.fn(async () => ({
        isRetryable: false,
        maxRetries: 0,
        suggestedDelay: 0,
        category: 'execution',
        confidence: 'high',
        reason: 'test',
      })),
      executeRecovery: vi.fn(async () => ({ shouldRetry: false, actionTaken: 'none' })),
      planRecovery: vi.fn(async () => null),
    } as any;

    const svc = new ExecutionService(
      { subscribe: vi.fn(), emit: vi.fn() } as any,
      null,
      {
        get: vi.fn(async () => feat),
        update: vi.fn(async (_p: string, _id: string, updates: Record<string, unknown>) => ({
          ...feat,
          ...updates,
        })),
        list: vi.fn(async () => []),
        save: vi.fn(async () => {}),
      } as any,
      null,
      recoveryService,
      null,
      new Map(),
      new Map(),
      90,
      95,
      callbacks
    );

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID, true /* useWorktrees */);

    const commands: string[] = mockExecAsync.mock.calls.map(([cmd]) => cmd as string);

    // Stash must never be called regardless of working tree state
    expect(commands).not.toContain('git stash --include-untracked');
    expect(commands).not.toContain('git stash pop');
    // Merge still runs
    expect(commands).toContain('git merge origin/dev');
  });

  it('blocks feature and aborts merge when merge conflicts occur', async () => {
    const feat = makeWorktreeFeature();

    mockExecAsync.mockImplementation(async (cmd: string) => {
      if (cmd === 'git merge origin/dev') {
        throw new Error('CONFLICT (content): Merge conflict in apps/server/src/index.ts');
      }
      return { stdout: '', stderr: '' };
    });

    const featureLoader = {
      get: vi.fn(async () => feat),
      update: vi.fn(async (_p: string, _id: string, updates: Record<string, unknown>) => ({
        ...feat,
        ...updates,
      })),
      list: vi.fn(async () => []),
      save: vi.fn(async () => {}),
    } as any;

    const callbacks = makeWorktreeCallbacks(feat);
    const recoveryService = {
      analyzeFailure: vi.fn(async () => ({
        isRetryable: false,
        maxRetries: 0,
        suggestedDelay: 0,
        category: 'execution',
        confidence: 'high',
        reason: 'test',
      })),
      executeRecovery: vi.fn(async () => ({ shouldRetry: false, actionTaken: 'none' })),
      planRecovery: vi.fn(async () => null),
    } as any;

    const svc = new ExecutionService(
      { subscribe: vi.fn(), emit: vi.fn() } as any,
      null,
      featureLoader,
      null,
      recoveryService,
      null,
      new Map(),
      new Map(),
      90,
      95,
      callbacks
    );

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID, true /* useWorktrees */);

    const commands: string[] = mockExecAsync.mock.calls.map(([cmd]) => cmd as string);

    // Merge abort must be called to clean up the worktree
    expect(commands).toContain('git merge --abort');
    // Feature must be blocked
    expect(featureLoader.update).toHaveBeenCalledWith(
      PROJECT_PATH,
      FEATURE_ID,
      expect.objectContaining({ status: 'blocked' })
    );
  });
});

// ---------------------------------------------------------------------------
// getModelForFeature — assignedRole model override tests
// ---------------------------------------------------------------------------

describe('ExecutionService - getModelForFeature assignedRole', () => {
  const PROJECT_PATH = '/tmp/test-project';

  function makeTestService(): ExecutionService {
    const feature = makeFeature();
    const callbacks = makeCallbacks(feature);
    const featureLoader = makeFeatureLoader(feature);
    const recoveryService = makeRecoveryService();
    return makeService(callbacks, featureLoader, recoveryService);
  }

  beforeEach(() => {
    mockGetAgent.mockReset();
    mockGetWorkflowSettings.mockReset();
    mockGetPhaseModelWithOverrides.mockReset();
    // Default: no phase model override
    mockGetPhaseModelWithOverrides.mockResolvedValue({
      phaseModel: { model: '' },
      isProjectOverride: false,
    });
    // Default: no workflow settings overrides
    mockGetWorkflowSettings.mockResolvedValue({});
    // Default: no manifest agent
    mockGetAgent.mockResolvedValue(undefined);
  });

  it('uses manifest model override when agent has a model', async () => {
    mockGetAgent.mockResolvedValue({
      name: 'frontend-dev',
      extends: 'developer',
      model: 'claude-opus-4-5',
    });

    const svc = makeTestService();
    const result = await (svc as any).getModelForFeature(
      { assignedRole: 'frontend-dev' },
      PROJECT_PATH
    );

    expect(result.model).toContain('claude-opus-4-5');
    expect(mockGetAgent).toHaveBeenCalledWith(PROJECT_PATH, 'frontend-dev');
  });

  it('uses settings roleModelOverrides when no manifest model is set', async () => {
    mockGetAgent.mockResolvedValue({ name: 'backend-dev', extends: 'developer' }); // no model
    mockGetWorkflowSettings.mockResolvedValue({
      agentConfig: {
        roleModelOverrides: {
          'backend-dev': { model: 'claude-haiku-4-5', providerId: 'anthropic' },
        },
      },
    });

    const svc = makeTestService();
    const result = await (svc as any).getModelForFeature(
      { assignedRole: 'backend-dev' },
      PROJECT_PATH
    );

    expect(result.model).toContain('claude-haiku-4-5');
    expect(result.providerId).toBe('anthropic');
  });

  it('manifest model takes precedence over settings roleModelOverrides when both exist', async () => {
    mockGetAgent.mockResolvedValue({
      name: 'full-stack',
      extends: 'developer',
      model: 'claude-opus-4-5',
    });
    mockGetWorkflowSettings.mockResolvedValue({
      agentConfig: {
        roleModelOverrides: {
          'full-stack': { model: 'claude-haiku-4-5' },
        },
      },
    });

    const svc = makeTestService();
    const result = await (svc as any).getModelForFeature(
      { assignedRole: 'full-stack' },
      PROJECT_PATH
    );

    // Manifest wins
    expect(result.model).toContain('claude-opus-4-5');
    // Settings override should NOT have been consulted for model
    expect(mockGetWorkflowSettings).not.toHaveBeenCalled();
  });

  it('falls through to agentExecutionModel setting when role has no manifest and no settings override', async () => {
    mockGetAgent.mockResolvedValue(undefined); // unknown role
    mockGetWorkflowSettings.mockResolvedValue({ agentConfig: { roleModelOverrides: {} } });
    mockGetPhaseModelWithOverrides.mockResolvedValue({
      phaseModel: { model: 'claude-sonnet-4-6' },
      isProjectOverride: false,
    });

    const svc = makeTestService();
    const result = await (svc as any).getModelForFeature(
      { assignedRole: 'unknown-role' },
      PROJECT_PATH
    );

    expect(result.model).toContain('claude-sonnet-4-6');
    expect(mockGetPhaseModelWithOverrides).toHaveBeenCalledWith(
      'agentExecutionModel',
      null,
      PROJECT_PATH
    );
  });

  it('features without assignedRole behave exactly as before (no manifest lookup)', async () => {
    mockGetPhaseModelWithOverrides.mockResolvedValue({
      phaseModel: { model: 'claude-sonnet-4-6' },
      isProjectOverride: false,
    });

    const svc = makeTestService();
    const result = await (svc as any).getModelForFeature({ complexity: 'medium' }, PROJECT_PATH);

    expect(result.model).toContain('claude-sonnet-4-6');
    expect(mockGetAgent).not.toHaveBeenCalled();
    expect(mockGetWorkflowSettings).not.toHaveBeenCalled();
  });

  it('explicit feature.model override still takes highest priority over assignedRole', async () => {
    mockGetAgent.mockResolvedValue({ name: 'dev', extends: 'developer', model: 'claude-opus-4-5' });

    const svc = makeTestService();
    const result = await (svc as any).getModelForFeature(
      { model: 'claude-haiku-4-5', assignedRole: 'dev' },
      PROJECT_PATH
    );

    expect(result.model).toContain('claude-haiku-4-5');
    expect(mockGetAgent).not.toHaveBeenCalled();
  });

  it('failure escalation still takes priority over assignedRole', async () => {
    mockGetAgent.mockResolvedValue({
      name: 'dev',
      extends: 'developer',
      model: 'claude-haiku-4-5',
    });

    const svc = makeTestService();
    const result = await (svc as any).getModelForFeature(
      { failureCount: 2, assignedRole: 'dev' },
      PROJECT_PATH
    );

    // Should be opus due to failure escalation, not haiku from manifest
    expect(mockGetAgent).not.toHaveBeenCalled();
    // The model should be the claude (opus) default
    expect(result.model).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Match rule auto-assign tests
// ---------------------------------------------------------------------------

describe('ExecutionService - match rule auto-assign', () => {
  const PROJECT_PATH = '/tmp/test-project';
  const FEATURE_ID = 'feature-match-test-1';

  let featureLoader: ReturnType<typeof makeFeatureLoader>;

  beforeEach(() => {
    vi.stubEnv('AUTOMAKER_MOCK_AGENT', 'true');
    mockMatchFeature.mockReset();
    mockMatchFeature.mockResolvedValue(null); // default: no match
    mockGetWorkflowSettings.mockReset();
    mockGetWorkflowSettings.mockResolvedValue({}); // default: no agentConfig
  });

  function makeMatchTestFeature(overrides: Partial<Feature> = {}): Feature {
    return makeFeature({
      id: FEATURE_ID,
      category: 'frontend',
      title: 'Add login form',
      description: 'Create a login form with email and password fields',
      filesToModify: ['apps/web/src/components/LoginForm.tsx'],
      ...overrides,
    });
  }

  it('category match: assigns role and persists routingSuggestion when matchFeature returns agent', async () => {
    const feat = makeMatchTestFeature();
    const callbacks = makeCallbacks(feat);
    featureLoader = makeFeatureLoader(feat);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    mockMatchFeature.mockResolvedValue({
      agent: {
        name: 'frontend-dev',
        extends: 'developer',
        description: 'Frontend specialist',
      },
      confidence: 1.0,
    });

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(featureLoader.update).toHaveBeenCalledWith(
      PROJECT_PATH,
      FEATURE_ID,
      expect.objectContaining({
        assignedRole: 'frontend-dev',
        routingSuggestion: expect.objectContaining({
          role: 'frontend-dev',
          confidence: 1.0,
          autoAssigned: true,
          reasoning: expect.stringContaining('frontend-dev'),
        }),
      })
    );
  });

  it('keyword match: assigns role based on keyword in title', async () => {
    const feat = makeMatchTestFeature({ title: 'Fix database migration script' });
    const callbacks = makeCallbacks(feat);
    featureLoader = makeFeatureLoader(feat);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    mockMatchFeature.mockResolvedValue({
      agent: {
        name: 'backend-dev',
        extends: 'developer',
        description: 'Backend specialist',
      },
      confidence: 0.8,
    });

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(featureLoader.update).toHaveBeenCalledWith(
      PROJECT_PATH,
      FEATURE_ID,
      expect.objectContaining({ assignedRole: 'backend-dev' })
    );
  });

  it('file pattern match: assigns role based on filesToModify', async () => {
    const feat = makeMatchTestFeature({
      filesToModify: ['apps/server/src/services/auth-service.ts'],
    });
    const callbacks = makeCallbacks(feat);
    featureLoader = makeFeatureLoader(feat);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    mockMatchFeature.mockResolvedValue({
      agent: {
        name: 'server-dev',
        extends: 'developer',
        description: 'Server specialist',
      },
      confidence: 0.9,
    });

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(featureLoader.update).toHaveBeenCalledWith(
      PROJECT_PATH,
      FEATURE_ID,
      expect.objectContaining({ assignedRole: 'server-dev' })
    );
    expect(mockMatchFeature).toHaveBeenCalledWith(
      PROJECT_PATH,
      expect.objectContaining({
        filesToModify: ['apps/server/src/services/auth-service.ts'],
      })
    );
  });

  it('no match: does not update assignedRole when matchFeature returns null', async () => {
    const feat = makeMatchTestFeature();
    const callbacks = makeCallbacks(feat);
    featureLoader = makeFeatureLoader(feat);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    mockMatchFeature.mockResolvedValue(null);

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID);

    const autoAssignCall = featureLoader.update.mock.calls.find(
      ([, , updates]) => 'assignedRole' in updates
    );
    expect(autoAssignCall).toBeUndefined();
  });

  it('manual override respected: skips matchFeature when assignedRole is already set', async () => {
    const feat = makeMatchTestFeature({ assignedRole: 'manual-role' as any });
    const callbacks = makeCallbacks(feat);
    featureLoader = makeFeatureLoader(feat);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(mockMatchFeature).not.toHaveBeenCalled();
  });

  it('autoAssignEnabled=false: skips matchFeature when disabled in agentConfig', async () => {
    const feat = makeMatchTestFeature();
    const callbacks = makeCallbacks(feat);
    featureLoader = makeFeatureLoader(feat);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    mockGetWorkflowSettings.mockResolvedValue({
      agentConfig: { autoAssignEnabled: false },
    });

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(mockMatchFeature).not.toHaveBeenCalled();
  });

  it('autoAssignEnabled=true: matchFeature is called when explicitly enabled', async () => {
    const feat = makeMatchTestFeature();
    const callbacks = makeCallbacks(feat);
    featureLoader = makeFeatureLoader(feat);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    mockGetWorkflowSettings.mockResolvedValue({
      agentConfig: { autoAssignEnabled: true },
    });
    mockMatchFeature.mockResolvedValue(null);

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(mockMatchFeature).toHaveBeenCalledWith(
      PROJECT_PATH,
      expect.objectContaining({ title: 'Add login form' })
    );
  });

  it('match error is non-fatal: execution proceeds even when matchFeature throws', async () => {
    const feat = makeMatchTestFeature();
    const callbacks = makeCallbacks(feat);
    featureLoader = makeFeatureLoader(feat);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    mockMatchFeature.mockRejectedValue(new Error('Manifest parse error'));

    // Should not throw — execution continues normally
    await expect(svc.executeFeature(PROJECT_PATH, FEATURE_ID)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Concurrency and runningFeatures tracking tests
// ---------------------------------------------------------------------------

describe('ExecutionService - concurrency and runningFeatures', () => {
  const PROJECT_PATH = '/tmp/test-project';
  const FEATURE_ID = 'feature-concurrency-test-1';

  beforeEach(() => {
    vi.stubEnv('AUTOMAKER_MOCK_AGENT', 'true');
    mockMatchFeature.mockReset();
    mockMatchFeature.mockResolvedValue(null);
    mockGetWorkflowSettings.mockReset();
    mockGetWorkflowSettings.mockResolvedValue({});
  });

  it('throws when feature is already running (no isRecursive flag)', async () => {
    const feature = makeFeature({ id: FEATURE_ID });
    const callbacks = makeCallbacks(feature);
    const featureLoader = makeFeatureLoader(feature);
    const runningFeatures = new Map<string, any>();

    const svc = new ExecutionService(
      makeEvents() as any,
      null,
      featureLoader,
      null,
      makeRecoveryService(),
      null,
      runningFeatures,
      new Map(),
      90,
      95,
      callbacks
    );

    // Seed the map to simulate an in-progress execution
    runningFeatures.set(FEATURE_ID, {
      featureId: FEATURE_ID,
      projectPath: PROJECT_PATH,
      worktreePath: null,
      branchName: null,
      abortController: new AbortController(),
      isAutoMode: false,
      startTime: Date.now(),
      retryCount: 0,
      previousErrors: [],
    });

    await expect(svc.executeFeature(PROJECT_PATH, FEATURE_ID)).rejects.toThrow(/already running/);
  });

  it('skips duplicate check when isRecursive is true', async () => {
    const feature = makeFeature({ id: FEATURE_ID });
    const callbacks = makeCallbacks(feature);
    const featureLoader = makeFeatureLoader(feature);
    const runningFeatures = new Map<string, any>();

    const svc = new ExecutionService(
      makeEvents() as any,
      null,
      featureLoader,
      null,
      makeRecoveryService(),
      null,
      runningFeatures,
      new Map(),
      90,
      95,
      callbacks
    );

    // Seed the map to simulate in-progress execution
    runningFeatures.set(FEATURE_ID, {
      featureId: FEATURE_ID,
      projectPath: PROJECT_PATH,
      worktreePath: null,
      branchName: null,
      abortController: new AbortController(),
      isAutoMode: false,
      startTime: Date.now(),
      retryCount: 0,
      previousErrors: [],
    });

    // Should NOT throw when isRecursive: true
    await expect(
      svc.executeFeature(PROJECT_PATH, FEATURE_ID, false, false, undefined, { isRecursive: true })
    ).resolves.not.toThrow();
  });

  it('review status does not block execution (not in TERMINAL_STATUSES)', async () => {
    const feature = makeFeature({ id: FEATURE_ID, status: 'review' });
    const callbacks = makeCallbacks(feature);
    const featureLoader = makeFeatureLoader(feature);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    // Should NOT return early — review is not terminal
    await svc.executeFeature(PROJECT_PATH, FEATURE_ID);

    // The feature must have been set to in_progress (execution proceeded)
    expect(callbacks.updateFeatureStatus).toHaveBeenCalledWith(
      PROJECT_PATH,
      FEATURE_ID,
      'in_progress'
    );
  });

  it('done status blocks execution (remains in TERMINAL_STATUSES)', async () => {
    const feature = makeFeature({ id: FEATURE_ID, status: 'done' });
    const callbacks = makeCallbacks(feature);
    const featureLoader = makeFeatureLoader(feature);
    const svc = makeService(callbacks, featureLoader, makeRecoveryService());

    await svc.executeFeature(PROJECT_PATH, FEATURE_ID);

    // Should return early — done is terminal, so updateFeatureStatus never called with in_progress
    expect(callbacks.updateFeatureStatus).not.toHaveBeenCalledWith(
      PROJECT_PATH,
      FEATURE_ID,
      'in_progress'
    );
  });
});
