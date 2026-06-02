/**
 * Tests for DeployProcessor — the DEPLOY state's merge-evidence guard (#4052).
 *
 * `done` means "PR merged". DEPLOY must never infer `done` from merely arriving in
 * the state; it requires real merge evidence (prMergedAt + a PR number). Without it,
 * DEPLOY escalates instead of marking a feature done with no shipped output.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DeployProcessor } from '@/services/lead-engineer-deploy-processor.js';
import type { ProcessorServiceContext, StateContext } from '@/services/lead-engineer-types.js';

function makeServiceContext(freshFeature: Record<string, unknown>): {
  ctxDeps: ProcessorServiceContext;
  update: ReturnType<typeof vi.fn>;
} {
  const update = vi.fn().mockResolvedValue(undefined);
  const ctxDeps = {
    featureLoader: {
      get: vi.fn().mockResolvedValue(freshFeature),
      update,
    },
    events: { emit: vi.fn(), subscribe: vi.fn(), on: vi.fn() },
    settingsService: { getGlobalSettings: vi.fn().mockResolvedValue({}) },
  } as unknown as ProcessorServiceContext;
  return { ctxDeps, update };
}

function makeProcessor(freshFeature: Record<string, unknown>) {
  const { ctxDeps, update } = makeServiceContext(freshFeature);
  const processor = new DeployProcessor(ctxDeps);
  // Neutralize post-promotion side-effects (typecheck/build, reflection, goal
  // verification) — not under test here; we only assert the status decision.
  vi.spyOn(processor as never, 'runPostMergeVerification').mockResolvedValue(undefined as never);
  vi.spyOn(processor as never, 'generateReflection').mockResolvedValue(undefined as never);
  vi.spyOn(processor as never, 'runGoalVerification').mockResolvedValue(undefined as never);
  return { processor, update };
}

function makeCtx(feature: Record<string, unknown>, prNumber?: number): StateContext {
  return {
    feature: feature as never,
    projectPath: '/test/project',
    prNumber,
  } as StateContext;
}

function doneWriteOf(update: ReturnType<typeof vi.fn>) {
  return update.mock.calls.find(
    (c) => (c[2] as { status?: string } | undefined)?.status === 'done'
  );
}

describe('DeployProcessor — merge-evidence guard (#4052)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('escalates (does NOT mark done) when reaching DEPLOY without merge evidence', async () => {
    // Feature is not done and has no prMergedAt — the #4052 stranded-work shape.
    const fresh = { id: 'f1', status: 'review', prNumber: undefined, prMergedAt: undefined };
    const { processor, update } = makeProcessor(fresh);

    const result = await processor.process(makeCtx(fresh, undefined));

    expect(result.nextState).toBe('ESCALATE');
    expect(doneWriteOf(update)).toBeUndefined();
  });

  it('promotes to done when merge evidence (prMergedAt + prNumber) is present', async () => {
    const fresh = {
      id: 'f1',
      status: 'review',
      prNumber: 123,
      prMergedAt: '2026-06-02T10:00:00Z',
    };
    const { processor, update } = makeProcessor(fresh);

    const result = await processor.process(makeCtx(fresh, 123));

    expect(result.nextState).toBe('DONE');
    expect(doneWriteOf(update)).toBeDefined();
  });

  it('does not re-mark or escalate when the feature is already done', async () => {
    const fresh = {
      id: 'f1',
      status: 'done',
      prNumber: 123,
      prMergedAt: '2026-06-02T10:00:00Z',
    };
    const { processor, update } = makeProcessor(fresh);

    const result = await processor.process(makeCtx(fresh, 123));

    expect(result.nextState).toBe('DONE');
    expect(doneWriteOf(update)).toBeUndefined();
  });
});
