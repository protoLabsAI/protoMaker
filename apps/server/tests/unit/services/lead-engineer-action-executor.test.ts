/**
 * Unit tests for LeadEngineerActionExecutor authority enforcement integration.
 *
 * Tests that:
 * - Actions within trust are executed normally
 * - Actions above trust are blocked and not executed
 * - The authorityEnforcement workflow flag controls whether checks run
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LeadEngineerSession, PolicyDecision, WorkflowSettings } from '@protolabsai/types';
import { ActionExecutor } from '@/services/lead-engineer-action-executor.js';
import type { ActionExecutorDeps } from '@/services/lead-engineer-action-executor.js';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function createMockEvents() {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    on: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };
}

function createMockFeatureLoader() {
  return {
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  };
}

function createMockAutoModeService() {
  return {
    startAutoLoopForProject: vi.fn().mockResolvedValue(undefined),
    stopFeature: vi.fn().mockResolvedValue(undefined),
    executeFeature: vi.fn().mockResolvedValue(undefined),
    followUpFeature: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAuthorityService(verdict: PolicyDecision['verdict'] = 'allow') {
  return {
    submitProposal: vi.fn().mockResolvedValue({
      verdict,
      reason: verdict === 'allow' ? 'Allowed by trust level' : 'Exceeds trust level',
    } as PolicyDecision),
  };
}

function createMockSession(overrides: Partial<LeadEngineerSession> = {}): LeadEngineerSession {
  return {
    projectPath: '/test/project',
    projectSlug: 'test-project',
    flowState: 'running',
    actionsTaken: 0,
    ruleLog: [],
    worldState: {
      projectPath: '/test/project',
      projectSlug: 'test-project',
      updatedAt: new Date().toISOString(),
      boardCounts: { backlog: 0, in_progress: 0, review: 0, done: 0, blocked: 0 },
      features: {},
      agents: [],
      openPRs: [],
      milestones: [],
      metrics: { totalFeatures: 0, completedFeatures: 0, totalCostUsd: 0 },
      autoModeRunning: true,
      maxConcurrency: 3,
    },
    ...overrides,
  } as LeadEngineerSession;
}

function createWorkflowSettings(authorityEnforcement: boolean): WorkflowSettings {
  return {
    pipeline: {
      goalGatesEnabled: true,
      checkpointEnabled: true,
      loopDetectionEnabled: true,
      supervisorEnabled: true,
      maxAgentRuntimeMinutes: 45,
      maxAgentCostUsd: 15,
    },
    retro: { enabled: true },
    cleanup: { autoCleanupEnabled: true, staleThresholdHours: 4 },
    signalIntake: { defaultCategory: 'ops', autoResearch: false, autoApprovePRD: false },
    bugs: { enabled: false },
    authorityEnforcement,
  };
}

function createDeps(overrides: Partial<ActionExecutorDeps> = {}): ActionExecutorDeps {
  return {
    events: createMockEvents(),
    featureLoader: createMockFeatureLoader() as unknown as ActionExecutorDeps['featureLoader'],
    autoModeService:
      createMockAutoModeService() as unknown as ActionExecutorDeps['autoModeService'],
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests: authority enforcement disabled (default)
// ──────────────────────────────────────────────────────────────────────────────

describe('ActionExecutor — no authority enforcement', () => {
  it('executes action normally when authorityService is not provided', async () => {
    const deps = createDeps();
    const executor = new ActionExecutor(deps);
    const session = createMockSession();

    await executor.executeAction(session, {
      type: 'move_feature',
      featureId: 'feat-1',
      toStatus: 'done',
    });

    expect(deps.featureLoader.update).toHaveBeenCalledWith('/test/project', 'feat-1', {
      status: 'done',
    });
    expect(session.actionsTaken).toBe(1);
  });

  it('executes action normally when authorityEnforcement is false', async () => {
    const mockAuthority = createMockAuthorityService('deny');
    const deps = createDeps({
      authorityService: mockAuthority as unknown as ActionExecutorDeps['authorityService'],
      workflowSettings: createWorkflowSettings(false),
    });
    const executor = new ActionExecutor(deps);
    const session = createMockSession();

    await executor.executeAction(session, {
      type: 'move_feature',
      featureId: 'feat-1',
      toStatus: 'done',
    });

    // Authority service should NOT be called when enforcement is disabled
    expect(mockAuthority.submitProposal).not.toHaveBeenCalled();
    expect(deps.featureLoader.update).toHaveBeenCalled();
    expect(session.actionsTaken).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: authority enforcement enabled, action allowed
// ──────────────────────────────────────────────────────────────────────────────

describe('ActionExecutor — authority enforcement enabled, action allowed', () => {
  it('calls submitProposal and executes when verdict is allow', async () => {
    const mockAuthority = createMockAuthorityService('allow');
    const deps = createDeps({
      authorityService: mockAuthority as unknown as ActionExecutorDeps['authorityService'],
      workflowSettings: createWorkflowSettings(true),
    });
    const executor = new ActionExecutor(deps);
    const session = createMockSession();

    await executor.executeAction(session, {
      type: 'move_feature',
      featureId: 'feat-1',
      toStatus: 'done',
    });

    expect(mockAuthority.submitProposal).toHaveBeenCalledOnce();
    expect(mockAuthority.submitProposal).toHaveBeenCalledWith(
      expect.objectContaining({ who: 'lead-engineer', target: 'feat-1' }),
      '/test/project'
    );
    expect(deps.featureLoader.update).toHaveBeenCalled();
    expect(session.actionsTaken).toBe(1);
  });

  it('executes log action without calling authority (informational action)', async () => {
    const mockAuthority = createMockAuthorityService('deny');
    const deps = createDeps({
      authorityService: mockAuthority as unknown as ActionExecutorDeps['authorityService'],
      workflowSettings: createWorkflowSettings(true),
    });
    const executor = new ActionExecutor(deps);
    const session = createMockSession();

    await executor.executeAction(session, {
      type: 'log',
      level: 'info',
      message: 'test message',
    });

    // Log actions are informational — no authority check
    expect(mockAuthority.submitProposal).not.toHaveBeenCalled();
    expect(session.actionsTaken).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: authority enforcement enabled, action blocked
// ──────────────────────────────────────────────────────────────────────────────

describe('ActionExecutor — authority enforcement enabled, action blocked', () => {
  it('blocks action and does not execute when verdict is deny', async () => {
    const mockAuthority = createMockAuthorityService('deny');
    const deps = createDeps({
      authorityService: mockAuthority as unknown as ActionExecutorDeps['authorityService'],
      workflowSettings: createWorkflowSettings(true),
    });
    const executor = new ActionExecutor(deps);
    const session = createMockSession();

    await executor.executeAction(session, {
      type: 'move_feature',
      featureId: 'feat-1',
      toStatus: 'done',
    });

    // Action should be blocked — featureLoader.update should NOT be called
    expect(deps.featureLoader.update).not.toHaveBeenCalled();
    // actionsTaken should NOT be incremented
    expect(session.actionsTaken).toBe(0);
    // Blocked event should be emitted
    expect(deps.events.emit).toHaveBeenCalledWith(
      'lead-engineer:action-blocked',
      expect.objectContaining({
        projectPath: '/test/project',
        actionType: 'move_feature',
        verdict: 'deny',
      })
    );
  });

  it('blocks action and does not execute when verdict is require_approval', async () => {
    const mockAuthority = createMockAuthorityService('require_approval');
    const deps = createDeps({
      authorityService: mockAuthority as unknown as ActionExecutorDeps['authorityService'],
      workflowSettings: createWorkflowSettings(true),
    });
    const executor = new ActionExecutor(deps);
    const session = createMockSession();

    await executor.executeAction(session, {
      type: 'stop_agent',
      featureId: 'feat-2',
    });

    expect(deps.autoModeService.stopFeature).not.toHaveBeenCalled();
    expect(session.actionsTaken).toBe(0);
  });

  it('blocks abort_and_resume (high-risk) when denied', async () => {
    const mockAuthority = createMockAuthorityService('deny');
    const deps = createDeps({
      authorityService: mockAuthority as unknown as ActionExecutorDeps['authorityService'],
      workflowSettings: createWorkflowSettings(true),
    });
    const executor = new ActionExecutor(deps);
    const session = createMockSession();

    await executor.executeAction(session, {
      type: 'abort_and_resume',
      featureId: 'feat-3',
      resumePrompt: 'Wrap up and create a PR',
    });

    expect(deps.autoModeService.stopFeature).not.toHaveBeenCalled();
    expect(deps.autoModeService.executeFeature).not.toHaveBeenCalled();
    expect(session.actionsTaken).toBe(0);
    expect(mockAuthority.submitProposal).toHaveBeenCalledWith(
      expect.objectContaining({ who: 'lead-engineer', risk: 'high', target: 'feat-3' }),
      '/test/project'
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests: authority service failure
// ──────────────────────────────────────────────────────────────────────────────

describe('ActionExecutor — authority service failure (fail-open)', () => {
  it('executes action when authority service throws (fail-open)', async () => {
    const mockAuthority = {
      submitProposal: vi.fn().mockRejectedValue(new Error('Authority service unavailable')),
    };
    const deps = createDeps({
      authorityService: mockAuthority as unknown as ActionExecutorDeps['authorityService'],
      workflowSettings: createWorkflowSettings(true),
    });
    const executor = new ActionExecutor(deps);
    const session = createMockSession();

    await executor.executeAction(session, {
      type: 'move_feature',
      featureId: 'feat-1',
      toStatus: 'backlog',
    });

    // On authority service error, fail-open: action proceeds
    expect(deps.featureLoader.update).toHaveBeenCalled();
    expect(session.actionsTaken).toBe(1);
  });
});
