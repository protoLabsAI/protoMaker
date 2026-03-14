/**
 * Unit tests for WorldStateBuilder — featureToSnapshot and updateFromEvent
 */

import { describe, it, expect } from 'vitest';
import type { Feature, EventType, LeadWorldState } from '@protolabsai/types';

// Import the class directly and test featureToSnapshot + updateFromEvent
// without needing to mock all deps (they're only used by build())
import { WorldStateBuilder } from '@/services/lead-engineer-world-state.js';

function makeBuilder(): WorldStateBuilder {
  // featureToSnapshot and updateFromEvent don't use deps — safe to pass empty stubs
  return new WorldStateBuilder({
    featureLoader: {} as any,
    autoModeService: {} as any,
    projectService: {} as any,
    metricsService: {} as any,
    settingsService: {} as any,
  });
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'f1',
    title: 'Test',
    description: 'Test feature',
    status: 'backlog',
    category: 'feature',
    ...overrides,
  };
}

function makeWorldState(overrides: Partial<LeadWorldState> = {}): LeadWorldState {
  return {
    projectPath: '/test',
    projectSlug: 'test',
    updatedAt: new Date().toISOString(),
    boardCounts: { backlog: 0, in_progress: 0, review: 0, done: 0, blocked: 0 },
    features: {},
    agents: [],
    openPRs: [],
    milestones: [],
    metrics: { totalFeatures: 0, completedFeatures: 0, totalCostUsd: 0 },
    autoModeRunning: false,
    maxConcurrency: 3,
    ...overrides,
  };
}

// ────────────────────────── featureToSnapshot ──────────────────────────

describe('featureToSnapshot', () => {
  const builder = makeBuilder();

  it('copies isFoundation field to snapshot', () => {
    const feature = makeFeature({ isFoundation: true });
    const snapshot = builder.featureToSnapshot(feature);
    expect(snapshot.isFoundation).toBe(true);
  });

  it('copies isFoundation=false', () => {
    const feature = makeFeature({ isFoundation: false });
    const snapshot = builder.featureToSnapshot(feature);
    expect(snapshot.isFoundation).toBe(false);
  });

  it('copies isFoundation=undefined when not set', () => {
    const feature = makeFeature();
    const snapshot = builder.featureToSnapshot(feature);
    expect(snapshot.isFoundation).toBeUndefined();
  });

  it('copies statusChangeReason to snapshot', () => {
    const feature = makeFeature({ statusChangeReason: 'git workflow failed' });
    const snapshot = builder.featureToSnapshot(feature);
    expect(snapshot.statusChangeReason).toBe('git workflow failed');
  });

  it('copies reviewStartedAt to snapshot', () => {
    const feature = makeFeature({ reviewStartedAt: '2026-01-01T00:00:00Z' });
    const snapshot = builder.featureToSnapshot(feature);
    expect(snapshot.reviewStartedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('copies all expected fields', () => {
    const feature = makeFeature({
      id: 'x',
      title: 'X',
      status: 'review',
      branchName: 'feature/x',
      prNumber: 42,
      prUrl: 'https://github.com/org/repo/pull/42',
      prCreatedAt: '2026-01-01',
      prMergedAt: '2026-01-02',
      costUsd: 1.5,
      failureCount: 2,
      dependencies: ['y'],
      epicId: 'epic-1',
      isEpic: false,
      isFoundation: true,
      complexity: 'large',
      startedAt: '2026-01-01',
      completedAt: '2026-01-02',
    });
    const s = builder.featureToSnapshot(feature);
    expect(s.id).toBe('x');
    expect(s.isFoundation).toBe(true);
    expect(s.complexity).toBe('large');
    expect(s.dependencies).toEqual(['y']);
  });
});

// ────────────────────────── updateFromEvent ──────────────────────────

describe('updateFromEvent', () => {
  const builder = makeBuilder();

  it('updates boardCounts on feature:status-changed', () => {
    const ws = makeWorldState({
      boardCounts: { backlog: 1, in_progress: 0 },
      features: { f1: { id: 'f1', status: 'backlog' } },
    });
    builder.updateFromEvent(ws, 'feature:status-changed' as EventType, {
      featureId: 'f1',
      oldStatus: 'backlog',
      newStatus: 'in_progress',
    });
    expect(ws.boardCounts['backlog']).toBe(0);
    expect(ws.boardCounts['in_progress']).toBe(1);
    expect(ws.features['f1'].status).toBe('in_progress');
  });

  it('decrements in_progress on feature:completed', () => {
    const ws = makeWorldState({
      boardCounts: { in_progress: 2 },
      features: { f1: { id: 'f1', status: 'in_progress' } },
      agents: [{ featureId: 'f1', startTime: new Date().toISOString() }],
    });
    builder.updateFromEvent(ws, 'feature:completed' as EventType, { featureId: 'f1' });
    expect(ws.agents).toHaveLength(0);
    expect(ws.boardCounts['in_progress']).toBe(1);
  });

  it('decrements in_progress on feature:error', () => {
    const ws = makeWorldState({
      boardCounts: { in_progress: 1 },
      features: { f1: { id: 'f1', status: 'in_progress' } },
      agents: [{ featureId: 'f1', startTime: new Date().toISOString() }],
    });
    builder.updateFromEvent(ws, 'feature:error' as EventType, { featureId: 'f1' });
    expect(ws.agents).toHaveLength(0);
    expect(ws.boardCounts['in_progress']).toBe(0);
  });

  it('deduplicates agent entries on feature:started', () => {
    const ws = makeWorldState({
      boardCounts: { backlog: 1, in_progress: 0 },
      features: { f1: { id: 'f1', status: 'backlog' } },
      agents: [{ featureId: 'f1', startTime: '2026-01-01T00:00:00Z' }],
    });
    builder.updateFromEvent(ws, 'feature:started' as EventType, { featureId: 'f1' });
    // Should have exactly one agent entry, not two
    expect(ws.agents).toHaveLength(1);
    expect(ws.agents[0].featureId).toBe('f1');
    // The new entry should have a different startTime
    expect(ws.agents[0].startTime).not.toBe('2026-01-01T00:00:00Z');
  });

  it('sets autoModeRunning on auto-mode events', () => {
    const ws = makeWorldState({ autoModeRunning: false });
    builder.updateFromEvent(ws, 'auto-mode:started' as EventType, {});
    expect(ws.autoModeRunning).toBe(true);
    builder.updateFromEvent(ws, 'auto-mode:stopped' as EventType, {});
    expect(ws.autoModeRunning).toBe(false);
  });

  it('increments completedFeatures on done transition', () => {
    const ws = makeWorldState({
      boardCounts: { review: 1, done: 0 },
      features: { f1: { id: 'f1', status: 'review' } },
      metrics: { totalFeatures: 1, completedFeatures: 0, totalCostUsd: 0 },
    });
    builder.updateFromEvent(ws, 'feature:status-changed' as EventType, {
      featureId: 'f1',
      newStatus: 'done',
    });
    expect(ws.metrics.completedFeatures).toBe(1);
    expect(ws.features['f1'].completedAt).toBeDefined();
  });
});
