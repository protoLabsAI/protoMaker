import { describe, it, expect } from 'vitest';
import type { LeadWorldState, LeadFeatureSnapshot, LeadAgentSnapshot } from '@protolabsai/types';
import {
  mergedNotDone,
  orphanedInProgress,
  staleDeps,
  autoModeHealth,
  staleReview,
  stuckAgent,
  capacityRestart,
  projectCompleting,
  prApproved,
  threadsBlocking,
  remediationStalled,
  classifiedRecovery,
  hitlFormResponse,
  missingCIChecks,
  reviewQueueSaturated,
  errorBudgetExhausted,
  evaluateRules,
  DEFAULT_RULES,
} from '@/services/lead-engineer-rules.js';

// ────────────────────────── Test Helpers ──────────────────────────

function createMockWorldState(overrides: Partial<LeadWorldState> = {}): LeadWorldState {
  return {
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
    ...overrides,
  };
}

function createFeature(overrides: Partial<LeadFeatureSnapshot> = {}): LeadFeatureSnapshot {
  return {
    id: 'feat-1',
    title: 'Test Feature',
    status: 'backlog',
    ...overrides,
  };
}

// ────────────────────────── mergedNotDone ──────────────────────────

describe('mergedNotDone', () => {
  it('moves review feature with merged PR to done', () => {
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prMergedAt: new Date().toISOString(),
      prNumber: 100,
    });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = mergedNotDone.evaluate(ws, 'feature:pr-merged', { featureId: 'f1' });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'move_feature', featureId: 'f1', toStatus: 'done' });
  });

  it('no-ops when feature is not in review', () => {
    const feature = createFeature({ id: 'f1', status: 'in_progress', prMergedAt: '2026-01-01' });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = mergedNotDone.evaluate(ws, 'feature:pr-merged', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when PR is not merged', () => {
    const feature = createFeature({ id: 'f1', status: 'review' });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = mergedNotDone.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when featureId is missing from payload', () => {
    const ws = createMockWorldState();
    const actions = mergedNotDone.evaluate(ws, 'feature:pr-merged', {});
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── orphanedInProgress ──────────────────────────

describe('orphanedInProgress', () => {
  it('resets feature in-progress >4h with no agent', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const feature = createFeature({ id: 'f1', status: 'in_progress', startedAt: fiveHoursAgo });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = orphanedInProgress.evaluate(ws, 'feature:stopped', { featureId: 'f1' });
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('reset_feature');
  });

  it('no-ops when agent is still running', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const feature = createFeature({ id: 'f1', status: 'in_progress', startedAt: fiveHoursAgo });
    const agent: LeadAgentSnapshot = {
      featureId: 'f1',
      startTime: fiveHoursAgo,
    };
    const ws = createMockWorldState({ features: { f1: feature }, agents: [agent] });
    const actions = orphanedInProgress.evaluate(ws, 'feature:stopped', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when in-progress less than 4h', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const feature = createFeature({ id: 'f1', status: 'in_progress', startedAt: oneHourAgo });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = orphanedInProgress.evaluate(ws, 'feature:stopped', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('scans all features on periodic trigger', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const f1 = createFeature({ id: 'f1', status: 'in_progress', startedAt: fiveHoursAgo });
    const f2 = createFeature({ id: 'f2', status: 'in_progress', startedAt: fiveHoursAgo });
    const f3 = createFeature({ id: 'f3', status: 'done' });
    const ws = createMockWorldState({ features: { f1, f2, f3 } });
    const actions = orphanedInProgress.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(2);
  });
});

// ────────────────────────── staleDeps ──────────────────────────

describe('staleDeps', () => {
  it('unblocks feature when dependency changes to done (payload is the dep)', () => {
    const f3 = createFeature({
      id: 'f3',
      status: 'blocked',
      dependencies: ['f1', 'f2'],
    });
    const f1 = createFeature({ id: 'f1', status: 'done' });
    const f2 = createFeature({ id: 'f2', status: 'done' });
    const ws = createMockWorldState({ features: { f1, f2, f3 } });
    // Payload is the dep that just changed to done — not the blocked feature
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'unblock_feature', featureId: 'f3' });
  });

  it('unblocks feature when deps are verified', () => {
    const f2 = createFeature({
      id: 'f2',
      status: 'blocked',
      dependencies: ['f1'],
    });
    const f1 = createFeature({ id: 'f1', status: 'verified' });
    const ws = createMockWorldState({ features: { f1, f2 } });
    // Payload is the dep that changed
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('unblock_feature');
  });

  it('no-ops when some deps are still in progress', () => {
    const f3 = createFeature({
      id: 'f3',
      status: 'blocked',
      dependencies: ['f1', 'f2'],
    });
    const f1 = createFeature({ id: 'f1', status: 'done' });
    const f2 = createFeature({ id: 'f2', status: 'in_progress' });
    const ws = createMockWorldState({ features: { f1, f2, f3 } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when feature is not blocked', () => {
    const f2 = createFeature({
      id: 'f2',
      status: 'backlog',
      dependencies: ['f1'],
    });
    const f1 = createFeature({ id: 'f1', status: 'done' });
    const ws = createMockWorldState({ features: { f1, f2 } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when feature has no deps', () => {
    const f1 = createFeature({ id: 'f1', status: 'blocked' });
    const ws = createMockWorldState({ features: { f1 } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('unblocks multiple features when shared dep completes', () => {
    const f1 = createFeature({ id: 'f1', status: 'done' });
    const f2 = createFeature({ id: 'f2', status: 'blocked', dependencies: ['f1'] });
    const f3 = createFeature({ id: 'f3', status: 'blocked', dependencies: ['f1'] });
    const ws = createMockWorldState({ features: { f1, f2, f3 } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.featureId).sort()).toEqual(['f2', 'f3']);
  });
});

// ────────────────────────── autoModeHealth ──────────────────────────

describe('autoModeHealth', () => {
  it('restarts auto-mode when backlog > 0 and auto-mode stopped', () => {
    const ws = createMockWorldState({
      boardCounts: { backlog: 5 },
      autoModeRunning: false,
    });
    const actions = autoModeHealth.evaluate(ws, 'auto-mode:stopped', {});
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: 'restart_auto_mode',
      projectPath: '/test/project',
      maxConcurrency: 3,
    });
  });

  it('no-ops when auto-mode is running', () => {
    const ws = createMockWorldState({
      boardCounts: { backlog: 5 },
      autoModeRunning: true,
    });
    const actions = autoModeHealth.evaluate(ws, 'auto-mode:stopped', {});
    expect(actions).toHaveLength(0);
  });

  it('no-ops when backlog is empty', () => {
    const ws = createMockWorldState({
      boardCounts: { backlog: 0 },
      autoModeRunning: false,
    });
    const actions = autoModeHealth.evaluate(ws, 'auto-mode:stopped', {});
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── staleReview ──────────────────────────

describe('staleReview', () => {
  it('enables auto-merge for review feature >30min without auto-merge', () => {
    const fortyMinAgo = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prNumber: 42,
      prCreatedAt: fortyMinAgo,
    });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = staleReview.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'enable_auto_merge', featureId: 'f1', prNumber: 42 });
  });

  it('no-ops when auto-merge is already enabled', () => {
    const fortyMinAgo = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prNumber: 42,
      prCreatedAt: fortyMinAgo,
    });
    const ws = createMockWorldState({
      features: { f1: feature },
      openPRs: [{ featureId: 'f1', prNumber: 42, autoMergeEnabled: true }],
    });
    const actions = staleReview.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when review is < 30min', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prNumber: 42,
      prCreatedAt: tenMinAgo,
    });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = staleReview.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when feature has no PR number', () => {
    const fortyMinAgo = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prCreatedAt: fortyMinAgo,
    });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = staleReview.evaluate(ws, 'feature:status-changed', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── stuckAgent ──────────────────────────

describe('stuckAgent', () => {
  it('aborts and resumes agent running >2h', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const ws = createMockWorldState({
      agents: [{ featureId: 'f1', startTime: threeHoursAgo }],
    });
    const actions = stuckAgent.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('abort_and_resume');
    if (actions[0].type === 'abort_and_resume') {
      expect(actions[0].featureId).toBe('f1');
      expect(actions[0].resumePrompt).toContain('wrap up');
    }
  });

  it('no-ops when agents are under 2h', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const ws = createMockWorldState({
      agents: [{ featureId: 'f1', startTime: oneHourAgo }],
    });
    const actions = stuckAgent.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(0);
  });

  it('sends message to multiple stuck agents', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const ws = createMockWorldState({
      agents: [
        { featureId: 'f1', startTime: threeHoursAgo },
        { featureId: 'f2', startTime: threeHoursAgo },
      ],
    });
    const actions = stuckAgent.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(2);
  });

  it('no-ops when no agents running', () => {
    const ws = createMockWorldState();
    const actions = stuckAgent.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── capacityRestart ──────────────────────────

describe('capacityRestart', () => {
  it('restarts auto-mode when agents < max and backlog > 0 and auto-mode stopped', () => {
    const ws = createMockWorldState({
      boardCounts: { backlog: 3 },
      autoModeRunning: false,
      agents: [{ featureId: 'f1', startTime: new Date().toISOString() }],
      maxConcurrency: 3,
    });
    const actions = capacityRestart.evaluate(ws, 'feature:completed', { featureId: 'f2' });
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('restart_auto_mode');
  });

  it('no-ops when auto-mode is running', () => {
    const ws = createMockWorldState({
      boardCounts: { backlog: 3 },
      autoModeRunning: true,
    });
    const actions = capacityRestart.evaluate(ws, 'feature:completed', { featureId: 'f2' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when at max capacity', () => {
    const ws = createMockWorldState({
      boardCounts: { backlog: 3 },
      autoModeRunning: false,
      agents: [
        { featureId: 'f1', startTime: new Date().toISOString() },
        { featureId: 'f2', startTime: new Date().toISOString() },
        { featureId: 'f3', startTime: new Date().toISOString() },
      ],
      maxConcurrency: 3,
    });
    const actions = capacityRestart.evaluate(ws, 'feature:completed', { featureId: 'f4' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when backlog is empty', () => {
    const ws = createMockWorldState({
      boardCounts: { backlog: 0 },
      autoModeRunning: false,
    });
    const actions = capacityRestart.evaluate(ws, 'feature:completed', {});
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── projectCompleting ──────────────────────────

describe('projectCompleting', () => {
  it('fires when all features are done', () => {
    const ws = createMockWorldState({
      metrics: { totalFeatures: 5, completedFeatures: 5, totalCostUsd: 10 },
    });
    const actions = projectCompleting.evaluate(ws, 'project:completed', {});
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'project_completing' });
  });

  it('no-ops when not all features are done', () => {
    const ws = createMockWorldState({
      metrics: { totalFeatures: 5, completedFeatures: 3, totalCostUsd: 10 },
    });
    const actions = projectCompleting.evaluate(ws, 'project:completed', {});
    expect(actions).toHaveLength(0);
  });

  it('no-ops when there are no features', () => {
    const ws = createMockWorldState({
      metrics: { totalFeatures: 0, completedFeatures: 0, totalCostUsd: 0 },
    });
    const actions = projectCompleting.evaluate(ws, 'project:completed', {});
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── prApproved ──────────────────────────

describe('prApproved', () => {
  it('enables auto-merge when PR is approved and auto-merge not enabled', () => {
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prNumber: 50,
    });
    const ws = createMockWorldState({
      features: { f1: feature },
      openPRs: [{ featureId: 'f1', prNumber: 50, autoMergeEnabled: false }],
    });
    const actions = prApproved.evaluate(ws, 'pr:approved', { featureId: 'f1' });
    expect(actions.some((a) => a.type === 'enable_auto_merge')).toBe(true);
  });

  it('resolves threads when PR is approved and has unresolved threads', () => {
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prNumber: 50,
    });
    const ws = createMockWorldState({
      features: { f1: feature },
      openPRs: [{ featureId: 'f1', prNumber: 50, unresolvedThreads: 3 }],
    });
    const actions = prApproved.evaluate(ws, 'github:pr:approved', { featureId: 'f1' });
    expect(actions.some((a) => a.type === 'resolve_threads_direct')).toBe(true);
  });

  it('skips auto-merge when already enabled', () => {
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prNumber: 50,
    });
    const ws = createMockWorldState({
      features: { f1: feature },
      openPRs: [{ featureId: 'f1', prNumber: 50, autoMergeEnabled: true, unresolvedThreads: 0 }],
    });
    const actions = prApproved.evaluate(ws, 'pr:approved', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when feature has no PR number', () => {
    const feature = createFeature({ id: 'f1', status: 'review' });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = prApproved.evaluate(ws, 'pr:approved', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── threadsBlocking ──────────────────────────

describe('threadsBlocking', () => {
  it('resolves threads when merge blocked by critical threads', () => {
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prNumber: 42,
    });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = threadsBlocking.evaluate(ws, 'pr:merge-blocked-critical-threads', {
      featureId: 'f1',
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: 'resolve_threads_direct',
      featureId: 'f1',
      prNumber: 42,
    });
  });

  it('no-ops when feature has no PR number', () => {
    const feature = createFeature({ id: 'f1', status: 'review' });
    const ws = createMockWorldState({ features: { f1: feature } });
    const actions = threadsBlocking.evaluate(ws, 'pr:merge-blocked-critical-threads', {
      featureId: 'f1',
    });
    expect(actions).toHaveLength(0);
  });

  it('no-ops when featureId missing from payload', () => {
    const ws = createMockWorldState();
    const actions = threadsBlocking.evaluate(ws, 'pr:merge-blocked-critical-threads', {});
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── remediationStalled ──────────────────────────

describe('remediationStalled', () => {
  it('resets feature when remediation stalled >1h', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      startedAt: twoHoursAgo,
    });
    const ws = createMockWorldState({
      features: { f1: feature },
      openPRs: [{ featureId: 'f1', prNumber: 42, isRemediating: true, prCreatedAt: twoHoursAgo }],
    });
    const actions = remediationStalled.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('reset_feature');
  });

  it('no-ops when PR is not remediating', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const feature = createFeature({ id: 'f1', status: 'review', startedAt: twoHoursAgo });
    const ws = createMockWorldState({
      features: { f1: feature },
      openPRs: [{ featureId: 'f1', prNumber: 42, isRemediating: false, prCreatedAt: twoHoursAgo }],
    });
    const actions = remediationStalled.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(0);
  });

  it('no-ops when remediation is under 1h', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const feature = createFeature({ id: 'f1', status: 'review', startedAt: thirtyMinAgo });
    const ws = createMockWorldState({
      features: { f1: feature },
      openPRs: [{ featureId: 'f1', prNumber: 42, isRemediating: true, prCreatedAt: thirtyMinAgo }],
    });
    const actions = remediationStalled.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(0);
  });

  it('checks multiple PRs', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const f1 = createFeature({ id: 'f1', status: 'review', startedAt: twoHoursAgo });
    const f2 = createFeature({ id: 'f2', status: 'review', startedAt: twoHoursAgo });
    const ws = createMockWorldState({
      features: { f1, f2 },
      openPRs: [
        { featureId: 'f1', prNumber: 41, isRemediating: true, prCreatedAt: twoHoursAgo },
        { featureId: 'f2', prNumber: 42, isRemediating: true, prCreatedAt: twoHoursAgo },
      ],
    });
    const actions = remediationStalled.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(2);
  });
});

// ────────────────────────── errorBudgetExhausted ──────────────────────────

describe('errorBudgetExhausted', () => {
  it('emits a warn log when errorBudgetExhausted is true', () => {
    const ws = createMockWorldState({ errorBudgetExhausted: true });
    const actions = errorBudgetExhausted.evaluate(ws, 'feature:pr-merged', {});
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('log');
    if (actions[0].type === 'log') {
      expect(actions[0].level).toBe('warn');
      expect(actions[0].message).toContain('errorBudgetExhausted');
    }
  });

  it('no-ops when errorBudgetExhausted is false', () => {
    const ws = createMockWorldState({ errorBudgetExhausted: false });
    const actions = errorBudgetExhausted.evaluate(ws, 'feature:pr-merged', {});
    expect(actions).toHaveLength(0);
  });

  it('no-ops when errorBudgetExhausted is undefined', () => {
    const ws = createMockWorldState({});
    const actions = errorBudgetExhausted.evaluate(ws, 'lead-engineer:rule-evaluated', {});
    expect(actions).toHaveLength(0);
  });

  it('is included in DEFAULT_RULES', () => {
    const names = DEFAULT_RULES.map((r) => r.name);
    expect(names).toContain('errorBudgetExhausted');
  });
});

// ────────────────────────── evaluateRules ──────────────────────────

describe('evaluateRules', () => {
  it('only runs rules matching the event type', () => {
    const feature = createFeature({
      id: 'f1',
      status: 'review',
      prMergedAt: new Date().toISOString(),
    });
    const ws = createMockWorldState({
      features: { f1: feature },
      boardCounts: { backlog: 5 },
      autoModeRunning: false,
    });
    // 'feature:pr-merged' should trigger mergedNotDone and capacityRestart
    const actions = evaluateRules(DEFAULT_RULES, ws, 'feature:pr-merged', { featureId: 'f1' });
    const actionTypes = actions.map((a) => a.type);
    expect(actionTypes).toContain('move_feature');
    expect(actionTypes).toContain('restart_auto_mode');
  });

  it('returns empty array when no rules match', () => {
    const ws = createMockWorldState();
    const actions = evaluateRules(DEFAULT_RULES, ws, 'some:random-event', {});
    expect(actions).toHaveLength(0);
  });

  it('collects actions from multiple matching rules', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const f1 = createFeature({ id: 'f1', status: 'in_progress', startedAt: fiveHoursAgo });
    const ws = createMockWorldState({
      features: { f1 },
      agents: [{ featureId: 'f1', startTime: fiveHoursAgo }],
    });
    // 'feature:stopped' triggers orphanedInProgress only, but agent is running so no action
    const actions = evaluateRules(DEFAULT_RULES, ws, 'feature:stopped', { featureId: 'f1' });
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── staleDeps failure guards ──────────────────────────

describe('staleDeps — failure guards', () => {
  it('does NOT unblock features with failureCount >= 3', () => {
    const dep = createFeature({ id: 'dep-1', status: 'done' });
    const blocked = createFeature({
      id: 'blocked-1',
      status: 'blocked',
      dependencies: ['dep-1'],
      failureCount: 3,
    });
    const ws = createMockWorldState({ features: { 'dep-1': dep, 'blocked-1': blocked } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'dep-1' });
    expect(actions).toHaveLength(0);
  });

  it('does NOT unblock features blocked due to git workflow failure', () => {
    const dep = createFeature({ id: 'dep-1', status: 'done' });
    const blocked = createFeature({
      id: 'blocked-1',
      status: 'blocked',
      dependencies: ['dep-1'],
      failureCount: 1,
      statusChangeReason: 'git workflow failed — uncommitted work in worktree',
    });
    const ws = createMockWorldState({ features: { 'dep-1': dep, 'blocked-1': blocked } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'dep-1' });
    expect(actions).toHaveLength(0);
  });

  it('does NOT unblock features blocked due to git commit failure', () => {
    const dep = createFeature({ id: 'dep-1', status: 'done' });
    const blocked = createFeature({
      id: 'blocked-1',
      status: 'blocked',
      dependencies: ['dep-1'],
      failureCount: 1,
      statusChangeReason: 'git commit hook failed in worktree',
    });
    const ws = createMockWorldState({ features: { 'dep-1': dep, 'blocked-1': blocked } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'dep-1' });
    expect(actions).toHaveLength(0);
  });

  it('DOES unblock features with failureCount < 3 and no git failure', () => {
    const dep = createFeature({ id: 'dep-1', status: 'done' });
    const blocked = createFeature({
      id: 'blocked-1',
      status: 'blocked',
      dependencies: ['dep-1'],
      failureCount: 2,
    });
    const ws = createMockWorldState({ features: { 'dep-1': dep, 'blocked-1': blocked } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'dep-1' });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'unblock_feature', featureId: 'blocked-1' });
  });
});

// ────────────────────────── autoModeHealth/capacityRestart debounce ──────────────────────────

describe('autoModeHealth — debounce', () => {
  it('skips restart when lastAutoModeRestartAt is within 5 minutes', () => {
    const ws = createMockWorldState({
      autoModeRunning: false,
      boardCounts: { backlog: 3, in_progress: 0, review: 0, done: 0, blocked: 0 },
      lastAutoModeRestartAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
    });
    const actions = autoModeHealth.evaluate(ws, 'auto-mode:idle', {});
    expect(actions).toHaveLength(0);
  });

  it('restarts when lastAutoModeRestartAt is older than 5 minutes', () => {
    const ws = createMockWorldState({
      autoModeRunning: false,
      boardCounts: { backlog: 3, in_progress: 0, review: 0, done: 0, blocked: 0 },
      lastAutoModeRestartAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 min ago
    });
    const actions = autoModeHealth.evaluate(ws, 'auto-mode:idle', {});
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('restart_auto_mode');
  });

  it('restarts when lastAutoModeRestartAt is not set', () => {
    const ws = createMockWorldState({
      autoModeRunning: false,
      boardCounts: { backlog: 3, in_progress: 0, review: 0, done: 0, blocked: 0 },
    });
    const actions = autoModeHealth.evaluate(ws, 'auto-mode:stopped', {});
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('restart_auto_mode');
  });
});

describe('capacityRestart — debounce', () => {
  it('skips restart when lastAutoModeRestartAt is within 5 minutes', () => {
    const ws = createMockWorldState({
      autoModeRunning: false,
      boardCounts: { backlog: 3, in_progress: 0, review: 0, done: 0, blocked: 0 },
      agents: [],
      maxConcurrency: 3,
      lastAutoModeRestartAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(), // 1 min ago
    });
    const actions = capacityRestart.evaluate(ws, 'feature:completed', {});
    expect(actions).toHaveLength(0);
  });

  it('restarts when lastAutoModeRestartAt is older than 5 minutes', () => {
    const ws = createMockWorldState({
      autoModeRunning: false,
      boardCounts: { backlog: 3, in_progress: 0, review: 0, done: 0, blocked: 0 },
      agents: [],
      maxConcurrency: 3,
      lastAutoModeRestartAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
    });
    const actions = capacityRestart.evaluate(ws, 'feature:completed', {});
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('restart_auto_mode');
  });
});

// ────────────────────────── classifiedRecovery ──────────────────────────

describe('classifiedRecovery', () => {
  it('auto-retries retryable escalated feature', () => {
    const f = createFeature({ id: 'esc-1', status: 'blocked' });
    const ws = createMockWorldState({ features: { 'esc-1': f } });
    const payload = {
      type: 'feature_escalated',
      context: {
        featureId: 'esc-1',
        retryCount: 0,
        failureAnalysis: {
          category: 'transient',
          isRetryable: true,
          suggestedDelay: 1000,
          maxRetries: 3,
          explanation: 'Temporary API failure',
          confidence: 0.9,
        },
      },
    };
    const actions = classifiedRecovery.evaluate(ws, 'escalation:signal-received', payload);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('reset_feature');
  });

  it('does not retry when not retryable', () => {
    const f = createFeature({ id: 'esc-1', status: 'blocked' });
    const ws = createMockWorldState({ features: { 'esc-1': f } });
    const payload = {
      type: 'feature_escalated',
      context: {
        featureId: 'esc-1',
        retryCount: 0,
        failureAnalysis: {
          category: 'config',
          isRetryable: false,
          suggestedDelay: 0,
          maxRetries: 0,
          explanation: 'Invalid API key',
          confidence: 0.95,
        },
      },
    };
    const actions = classifiedRecovery.evaluate(ws, 'escalation:signal-received', payload);
    expect(actions).toHaveLength(0);
  });

  it('does not retry when max retries exceeded', () => {
    const f = createFeature({ id: 'esc-1', status: 'blocked' });
    const ws = createMockWorldState({ features: { 'esc-1': f } });
    const payload = {
      type: 'feature_escalated',
      context: {
        featureId: 'esc-1',
        retryCount: 3,
        failureAnalysis: {
          category: 'transient',
          isRetryable: true,
          suggestedDelay: 1000,
          maxRetries: 3,
          explanation: 'Temporary API failure',
          confidence: 0.9,
        },
      },
    };
    const actions = classifiedRecovery.evaluate(ws, 'escalation:signal-received', payload);
    expect(actions).toHaveLength(0);
  });

  it('does not retry when confidence is low', () => {
    const f = createFeature({ id: 'esc-1', status: 'blocked' });
    const ws = createMockWorldState({ features: { 'esc-1': f } });
    const payload = {
      type: 'feature_escalated',
      context: {
        featureId: 'esc-1',
        retryCount: 0,
        failureAnalysis: {
          category: 'transient',
          isRetryable: true,
          suggestedDelay: 1000,
          maxRetries: 3,
          explanation: 'Maybe transient',
          confidence: 0.5,
        },
      },
    };
    const actions = classifiedRecovery.evaluate(ws, 'escalation:signal-received', payload);
    expect(actions).toHaveLength(0);
  });

  it('no-ops for non feature_escalated event types', () => {
    const ws = createMockWorldState();
    const payload = { type: 'feature_reset', context: { featureId: 'f1' } };
    const actions = classifiedRecovery.evaluate(ws, 'escalation:signal-received', payload);
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── hitlFormResponse ──────────────────────────

describe('hitlFormResponse', () => {
  it('handles retry response — resets failure count and moves to backlog', () => {
    const f = createFeature({ id: 'hitl-1', status: 'blocked', failureCount: 3 });
    const ws = createMockWorldState({ features: { 'hitl-1': f } });
    const payload = {
      featureId: 'hitl-1',
      response: [{ resolution: 'retry' }],
    };
    const actions = hitlFormResponse.evaluate(ws, 'lead-engineer:hitl-response', payload);
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('update_feature');
    expect(actions[1]).toEqual({ type: 'move_feature', featureId: 'hitl-1', toStatus: 'backlog' });
  });

  it('handles provide_context response — stores context in statusChangeReason', () => {
    const f = createFeature({ id: 'hitl-1', status: 'blocked' });
    const ws = createMockWorldState({ features: { 'hitl-1': f } });
    const payload = {
      featureId: 'hitl-1',
      response: [{ resolution: 'provide_context' }, { context: 'Try using the v2 API instead' }],
    };
    const actions = hitlFormResponse.evaluate(ws, 'lead-engineer:hitl-response', payload);
    expect(actions).toHaveLength(2);
    const updateAction = actions[0] as { type: 'update_feature'; updates: Record<string, unknown> };
    expect(updateAction.updates.statusChangeReason).toContain('Try using the v2 API instead');
    expect(actions[1]).toEqual({ type: 'move_feature', featureId: 'hitl-1', toStatus: 'backlog' });
  });

  it('handles skip response — moves to done', () => {
    const f = createFeature({ id: 'hitl-1', status: 'blocked' });
    const ws = createMockWorldState({ features: { 'hitl-1': f } });
    const payload = {
      featureId: 'hitl-1',
      response: [{ resolution: 'skip' }],
    };
    const actions = hitlFormResponse.evaluate(ws, 'lead-engineer:hitl-response', payload);
    expect(actions).toHaveLength(2);
    expect(actions[1]).toEqual({ type: 'move_feature', featureId: 'hitl-1', toStatus: 'done' });
  });

  it('no-ops for unknown feature', () => {
    const ws = createMockWorldState();
    const payload = { featureId: 'unknown', response: [{ resolution: 'retry' }] };
    const actions = hitlFormResponse.evaluate(ws, 'lead-engineer:hitl-response', payload);
    expect(actions).toHaveLength(0);
  });

  it('no-ops for empty response', () => {
    const f = createFeature({ id: 'hitl-1', status: 'blocked' });
    const ws = createMockWorldState({ features: { 'hitl-1': f } });
    const payload = { featureId: 'hitl-1', response: [] };
    const actions = hitlFormResponse.evaluate(ws, 'lead-engineer:hitl-response', payload);
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── missingCIChecks ──────────────────────────

describe('missingCIChecks', () => {
  it('logs diagnostic warning when CI checks are missing', () => {
    const ws = createMockWorldState();
    const payload = {
      featureId: 'f1',
      prNumber: 42,
      baseBranch: 'dev',
      missingChecks: ['build', 'test'],
      waitingMinutes: 35,
      possibleCause: 'CI workflow may target a different branch',
    };
    const actions = missingCIChecks.evaluate(ws, 'pr:missing-ci-checks', payload);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('log');
    const logAction = actions[0] as { type: 'log'; message: string };
    expect(logAction.message).toContain('build');
    expect(logAction.message).toContain('test');
    expect(logAction.message).toContain('PR #42');
  });

  it('no-ops when required fields are missing', () => {
    const ws = createMockWorldState();
    const actions = missingCIChecks.evaluate(ws, 'pr:missing-ci-checks', {
      featureId: 'f1',
      prNumber: 42,
    });
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── reviewQueueSaturated ──────────────────────────

describe('reviewQueueSaturated', () => {
  it('logs saturation when review count exceeds threshold', () => {
    const features: Record<string, LeadFeatureSnapshot> = {};
    for (let i = 0; i < 6; i++) {
      features[`r${i}`] = createFeature({ id: `r${i}`, status: 'review', prNumber: 100 + i });
    }
    const ws = createMockWorldState({ features });
    const actions = reviewQueueSaturated.evaluate(ws, 'feature:status-changed', {});
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('log');
    const logAction = actions[0] as { type: 'log'; message: string };
    expect(logAction.message).toContain('6/5');
  });

  it('no-ops when review count is below threshold', () => {
    const features: Record<string, LeadFeatureSnapshot> = {};
    for (let i = 0; i < 3; i++) {
      features[`r${i}`] = createFeature({ id: `r${i}`, status: 'review', prNumber: 100 + i });
    }
    const ws = createMockWorldState({ features });
    const actions = reviewQueueSaturated.evaluate(ws, 'feature:status-changed', {});
    expect(actions).toHaveLength(0);
  });
});

// ────────────────────────── staleDeps — isFoundation semantics ──────────────────────────

describe('staleDeps — foundation deps require done', () => {
  it('does NOT unblock when foundation dep is in review', () => {
    const dep = createFeature({ id: 'dep-f', status: 'review', isFoundation: true });
    const blocked = createFeature({
      id: 'blocked-f',
      status: 'blocked',
      dependencies: ['dep-f'],
    });
    const ws = createMockWorldState({ features: { 'dep-f': dep, 'blocked-f': blocked } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'dep-f' });
    expect(actions).toHaveLength(0);
  });

  it('DOES unblock when foundation dep is done', () => {
    const dep = createFeature({ id: 'dep-f', status: 'done', isFoundation: true });
    const blocked = createFeature({
      id: 'blocked-f',
      status: 'blocked',
      dependencies: ['dep-f'],
    });
    const ws = createMockWorldState({ features: { 'dep-f': dep, 'blocked-f': blocked } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'dep-f' });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'unblock_feature', featureId: 'blocked-f' });
  });

  it('DOES unblock when non-foundation dep is in review', () => {
    const dep = createFeature({ id: 'dep-nf', status: 'review', isFoundation: false });
    const blocked = createFeature({
      id: 'blocked-nf',
      status: 'blocked',
      dependencies: ['dep-nf'],
    });
    const ws = createMockWorldState({ features: { 'dep-nf': dep, 'blocked-nf': blocked } });
    const actions = staleDeps.evaluate(ws, 'feature:status-changed', { featureId: 'dep-nf' });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'unblock_feature', featureId: 'blocked-nf' });
  });
});
