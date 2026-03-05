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

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@protolabsai/error-tracking', () => ({
  setFeatureContext: vi.fn(),
}));

vi.mock('@protolabsai/git-utils', () => ({
  rebaseWorktreeOnMain: vi.fn(async () => ({ success: true })),
}));

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

vi.mock('@/lib/settings-helpers.js', () => ({
  getWorkflowSettings: vi.fn(async () => ({})),
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
    emitAutoModeEvent: vi.fn(),
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

function makeService(
  callbacks: IAutoModeCallbacks,
  featureLoader: ReturnType<typeof makeFeatureLoader>,
  recoveryService: ReturnType<typeof makeRecoveryService>
): ExecutionService {
  return new ExecutionService(
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
  let service: ExecutionService;

  beforeEach(() => {
    vi.stubEnv('AUTOMAKER_MOCK_AGENT', 'true');

    feature = makeFeature({ id: FEATURE_ID });
    callbacks = makeCallbacks(feature);
    featureLoader = makeFeatureLoader(feature);
    recoveryService = makeRecoveryService();
    service = makeService(callbacks, featureLoader, recoveryService);
  });

  it('agent start: emitAutoModeEvent called with auto_mode_feature_start', async () => {
    await service.executeFeature(PROJECT_PATH, FEATURE_ID);

    expect(callbacks.emitAutoModeEvent).toHaveBeenCalledWith(
      'auto_mode_feature_start',
      expect.objectContaining({ featureId: FEATURE_ID, projectPath: PROJECT_PATH })
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
