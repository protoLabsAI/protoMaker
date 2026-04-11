/**
 * Tests for the worktree fallback guard — ensures agents never silently
 * fall back to the main working tree when worktree creation fails.
 */

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
  rename: vi.fn(async () => undefined),
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
    id: 'feat-wt-1',
    title: 'Worktree Test Feature',
    description: 'Tests worktree fallback guard',
    status: 'backlog',
    branchName: 'feature/wt-test',
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
    branchPrefixForCategory: vi.fn((category: string | undefined) => {
      const c = (category ?? '').toLowerCase();
      if (c === 'bug' || c === 'fix') return 'fix';
      if (c === 'ops' || c === 'chore' || c === 'maintenance') return 'chore';
      if (c === 'docs') return 'docs';
      return 'feature';
    }),
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

describe('Worktree fallback guard', () => {
  const PROJECT_PATH = '/tmp/test-project';
  const FEATURE_ID = 'feat-wt-1';

  let feature: Feature;
  let featureLoader: ReturnType<typeof makeFeatureLoader>;
  let recoveryService: ReturnType<typeof makeRecoveryService>;
  let events: ReturnType<typeof makeEvents>;

  beforeEach(() => {
    vi.stubEnv('AUTOMAKER_MOCK_AGENT', 'true');
    feature = makeFeature();
    featureLoader = makeFeatureLoader(feature);
    recoveryService = makeRecoveryService();
    events = makeEvents();
  });

  describe('when worktree creation fails and useWorktrees is true', () => {
    it('blocks the feature instead of falling back to projectPath', async () => {
      const callbacks = makeCallbacks(feature, {
        findExistingWorktreeForBranch: vi.fn(async () => null),
        createWorktreeForBranch: vi.fn(async () => null), // Simulates failure
      });
      const service = makeService(callbacks, featureLoader, recoveryService, events);

      await service.executeFeature(PROJECT_PATH, FEATURE_ID, true);

      // Feature should be updated to blocked status
      expect(featureLoader.update).toHaveBeenCalledWith(
        PROJECT_PATH,
        FEATURE_ID,
        expect.objectContaining({
          status: 'blocked',
          statusChangeReason: expect.stringContaining('Worktree creation failed'),
        })
      );

      // Error event should be emitted
      expect(events.emit).toHaveBeenCalledWith(
        'feature:error',
        expect.objectContaining({
          projectPath: PROJECT_PATH,
          featureId: FEATURE_ID,
          error: expect.stringContaining('Worktree creation failed'),
        })
      );

      // Agent should NOT have been started (no in_progress status update)
      expect(callbacks.updateFeatureStatus).not.toHaveBeenCalledWith(
        PROJECT_PATH,
        FEATURE_ID,
        'in_progress'
      );
    });
  });

  describe('when branchName is missing and useWorktrees is true', () => {
    it('generates a fallback branch name and blocks if worktree creation fails', async () => {
      const noBranchFeature = makeFeature({ branchName: null });
      const callbacks = makeCallbacks(noBranchFeature, {
        findExistingWorktreeForBranch: vi.fn(async () => null),
        createWorktreeForBranch: vi.fn(async () => null), // creation fails
      });
      const noBranchLoader = makeFeatureLoader(noBranchFeature);
      const service = makeService(callbacks, noBranchLoader, recoveryService, events);

      await service.executeFeature(PROJECT_PATH, FEATURE_ID, true);

      // First: branch name is persisted (fallback slug when no settingsService)
      expect(noBranchLoader.update).toHaveBeenNthCalledWith(
        1,
        PROJECT_PATH,
        FEATURE_ID,
        expect.objectContaining({
          branchName: expect.stringMatching(/^feature\//),
        })
      );

      // Second: blocked because worktree creation failed
      expect(noBranchLoader.update).toHaveBeenNthCalledWith(
        2,
        PROJECT_PATH,
        FEATURE_ID,
        expect.objectContaining({
          status: 'blocked',
          statusChangeReason: expect.stringContaining('Worktree creation failed'),
        })
      );

      expect(events.emit).toHaveBeenCalledWith(
        'feature:error',
        expect.objectContaining({
          featureId: FEATURE_ID,
          error: expect.stringContaining('Worktree creation failed'),
        })
      );
    });
  });

  describe('when worktree creation succeeds', () => {
    it('uses the worktree path as workDir (not projectPath)', async () => {
      const worktreePath = '/tmp/test-project/.worktrees/feature-wt-test';
      const callbacks = makeCallbacks(feature, {
        findExistingWorktreeForBranch: vi.fn(async () => null),
        createWorktreeForBranch: vi.fn(async () => worktreePath),
      });
      const service = makeService(callbacks, featureLoader, recoveryService, events);

      await service.executeFeature(PROJECT_PATH, FEATURE_ID, true);

      // Feature should NOT be blocked
      expect(featureLoader.update).not.toHaveBeenCalledWith(
        PROJECT_PATH,
        FEATURE_ID,
        expect.objectContaining({ status: 'blocked' })
      );

      // Feature should proceed to in_progress
      expect(callbacks.updateFeatureStatus).toHaveBeenCalledWith(
        PROJECT_PATH,
        FEATURE_ID,
        'in_progress'
      );
    });
  });

  describe('when existing worktree is found', () => {
    it('uses the existing worktree path', async () => {
      const worktreePath = '/tmp/test-project/.worktrees/feature-wt-test';
      const callbacks = makeCallbacks(feature, {
        findExistingWorktreeForBranch: vi.fn(async () => worktreePath),
      });
      const service = makeService(callbacks, featureLoader, recoveryService, events);

      await service.executeFeature(PROJECT_PATH, FEATURE_ID, true);

      // Should NOT attempt to create a new worktree
      expect(callbacks.createWorktreeForBranch).not.toHaveBeenCalled();

      // Feature should proceed normally
      expect(callbacks.updateFeatureStatus).toHaveBeenCalledWith(
        PROJECT_PATH,
        FEATURE_ID,
        'in_progress'
      );
    });
  });

  describe('when useWorktrees is false', () => {
    it('allows execution with projectPath directly (no blocking)', async () => {
      const noBranchFeature = makeFeature({ branchName: null });
      const callbacks = makeCallbacks(noBranchFeature);
      const noBranchLoader = makeFeatureLoader(noBranchFeature);
      const service = makeService(callbacks, noBranchLoader, recoveryService, events);

      await service.executeFeature(PROJECT_PATH, FEATURE_ID, false);

      // Feature should NOT be blocked
      expect(noBranchLoader.update).not.toHaveBeenCalledWith(
        PROJECT_PATH,
        FEATURE_ID,
        expect.objectContaining({ status: 'blocked' })
      );

      // Feature should proceed to in_progress
      expect(callbacks.updateFeatureStatus).toHaveBeenCalledWith(
        PROJECT_PATH,
        FEATURE_ID,
        'in_progress'
      );
    });
  });

  describe('defense-in-depth: workDir equals projectPath with useWorktrees', () => {
    it('blocks the feature if worktree resolves to projectPath', async () => {
      // Simulate a worktree finder that returns projectPath itself
      const callbacks = makeCallbacks(feature, {
        findExistingWorktreeForBranch: vi.fn(async () => PROJECT_PATH),
      });
      const service = makeService(callbacks, featureLoader, recoveryService, events);

      await service.executeFeature(PROJECT_PATH, FEATURE_ID, true);

      expect(featureLoader.update).toHaveBeenCalledWith(
        PROJECT_PATH,
        FEATURE_ID,
        expect.objectContaining({
          status: 'blocked',
          statusChangeReason: expect.stringContaining('workDir resolved to projectPath'),
        })
      );
    });
  });
});
