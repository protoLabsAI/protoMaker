/**
 * Unit tests for ReviewProcessor — external merge detection, early-exit paths,
 * and close_and_recut remediation for CONFLICTING PRs.
 *
 * Covers:
 * 1. Feature in REVIEW + PR merged externally → processor detects merge and returns DONE
 * 2. Feature already `done` → REVIEW process() is a no-op (returns immediately)
 * 3. PR is CONFLICTING → closes PR, posts comment, resets feature to backlog (no HITL)
 * 4. PR is CONFLICTING + branch already merged → marks feature done (superseded)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Use vi.hoisted so mockExecAsync is available inside vi.mock factory (which is hoisted).
const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}));

// Mock child_process + util so `execAsync` in the source module uses our mock.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, exec: vi.fn() };
});

vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return { ...actual, promisify: () => mockExecAsync };
});

import { ReviewProcessor } from '../../../src/services/lead-engineer-review-merge-processors.js';
import type {
  ProcessorServiceContext,
  StateContext,
} from '../../../src/services/lead-engineer-types.js';
import type { Feature } from '@protolabsai/types';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-review-001',
    title: 'Test Feature',
    description: 'A feature under review',
    status: 'review',
    category: 'feature',
    branchName: 'feature/test-branch',
    ...overrides,
  };
}

function makeCtx(feature: Feature, prNumber?: number): StateContext {
  return {
    feature,
    projectPath: '/test/project',
    retryCount: 0,
    infraRetryCount: 0,
    planRequired: false,
    remediationAttempts: 0,
    mergeRetryCount: 0,
    planRetryCount: 0,
    prNumber,
  };
}

function makeServiceContext(featureOverrides: Partial<Feature> = {}): ProcessorServiceContext {
  const feature = makeFeature(featureOverrides);
  return {
    events: {
      emit: vi.fn(),
      subscribe: vi.fn(),
      on: vi.fn(),
    } as unknown as ProcessorServiceContext['events'],
    featureLoader: {
      get: vi.fn().mockResolvedValue(feature),
      update: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([feature]),
    } as unknown as ProcessorServiceContext['featureLoader'],
    autoModeService: {
      getRunningAgents: vi.fn().mockResolvedValue([]),
      getActiveAutoLoopProjects: vi.fn().mockReturnValue([]),
    } as unknown as ProcessorServiceContext['autoModeService'],
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('ReviewProcessor — external merge detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('feature in REVIEW + PR merged externally → detects merge and terminates (no-op transition)', async () => {
    // Feature is in 'review' status (not yet done from the board's perspective)
    const feature = makeFeature({ status: 'review', branchName: 'feature/test-branch' });
    const serviceCtx = makeServiceContext({ status: 'review', branchName: 'feature/test-branch' });

    // featureLoader.get returns the same feature (not yet done)
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    // gh pr list returns merged=true for the branch
    mockExecAsync.mockResolvedValue({ stdout: 'true\n', stderr: '' });

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    // Should terminate without continuing (no-op: feature done)
    expect(result.shouldContinue).toBe(false);
    expect(result.nextState).toBeNull();
    expect(result.reason).toMatch(/merged externally/i);

    // Should have updated feature status to done
    expect(serviceCtx.featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-review-001',
      { status: 'done' }
    );

    // Should have emitted the merge event
    expect(serviceCtx.events.emit).toHaveBeenCalledWith(
      'feature:pr-merged',
      expect.objectContaining({ featureId: 'feat-review-001' })
    );
  });

  it('feature already done → REVIEW process() is a no-op (returns immediately, no gh CLI calls)', async () => {
    // Feature is already 'done' on the board
    const feature = makeFeature({ status: 'done', branchName: 'feature/test-branch' });
    const serviceCtx = makeServiceContext({ status: 'done', branchName: 'feature/test-branch' });

    // featureLoader.get returns the done feature
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    // Should terminate immediately without continuing
    expect(result.shouldContinue).toBe(false);
    expect(result.nextState).toBeNull();
    expect(result.reason).toMatch(/already done/i);

    // Should NOT have called gh CLI
    expect(mockExecAsync).not.toHaveBeenCalled();

    // enter() persists reviewStartedAt — that's expected.
    // process() should NOT have updated feature status or emitted merge/status events.
    const updateCalls = (serviceCtx.featureLoader.update as ReturnType<typeof vi.fn>).mock.calls;
    const nonReviewStartCalls = updateCalls.filter(
      (call: unknown[]) => !(call[2] as Record<string, unknown>)?.reviewStartedAt
    );
    expect(nonReviewStartCalls).toHaveLength(0);
    expect(serviceCtx.events.emit).not.toHaveBeenCalled();
  });
});

// ── close_and_recut tests ─────────────────────────────────────────────────────

describe('ReviewProcessor — close_and_recut for CONFLICTING PRs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CONFLICTING PR → closes PR with comment and resets feature to backlog (no HITL)', async () => {
    const feature = makeFeature({ status: 'review', branchName: 'fix/test-fix' });
    const serviceCtx = makeServiceContext({ status: 'review', branchName: 'fix/test-fix' });
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    // Call sequence:
    // 1. checkBranchMerged (gh pr list): returns '' (not merged yet)
    // 2. getMergeableState: returns CONFLICTING
    // 3. gh pr comment: success
    // 4. gh pr close: success
    // 5. checkBranchMerged inside handleConflictingPR (gh pr list): returns '' (not merged)
    mockExecAsync
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkBranchMerged → not merged
      .mockResolvedValueOnce({ stdout: '"CONFLICTING"', stderr: '' }) // getMergeableState
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // gh pr comment
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // gh pr close
      .mockResolvedValueOnce({ stdout: '', stderr: '' }); // checkBranchMerged (handleConflictingPR)

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature, 42);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    // Should terminate cleanly — no HITL escalation
    expect(result.shouldContinue).toBe(false);
    expect(result.nextState).toBeNull();
    expect(result.reason).toMatch(/backlog/i);

    // Should have closed the PR
    const execCalls = mockExecAsync.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(execCalls.some((cmd) => cmd.includes('gh pr close 42'))).toBe(true);
    expect(execCalls.some((cmd) => cmd.includes('gh pr comment 42'))).toBe(true);

    // Feature should be reset to backlog, not blocked or escalated
    expect(serviceCtx.featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-review-001',
      { status: 'backlog' }
    );

    // Should NOT have emitted a merge event
    expect(serviceCtx.events.emit).not.toHaveBeenCalledWith('feature:pr-merged', expect.anything());
  });

  it('CONFLICTING PR + branch already merged → marks feature done (superseded)', async () => {
    const feature = makeFeature({ status: 'review', branchName: 'fix/test-fix' });
    const serviceCtx = makeServiceContext({ status: 'review', branchName: 'fix/test-fix' });
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    // Call sequence:
    // 1. checkBranchMerged (gh pr list): returns '' (not merged yet)
    // 2. getMergeableState: CONFLICTING
    // 3. gh pr comment: success
    // 4. gh pr close: success
    // 5. checkBranchMerged inside handleConflictingPR: returns a mergedAt timestamp → merged
    mockExecAsync
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkBranchMerged → not merged
      .mockResolvedValueOnce({ stdout: '"CONFLICTING"', stderr: '' }) // getMergeableState
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // gh pr comment
      .mockResolvedValueOnce({ stdout: '', stderr: '' }) // gh pr close
      .mockResolvedValueOnce({ stdout: '2024-01-15T12:00:00Z\n', stderr: '' }); // checkBranchMerged (handleConflictingPR)

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature, 42);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    // Should terminate cleanly
    expect(result.shouldContinue).toBe(false);
    expect(result.nextState).toBeNull();
    expect(result.reason).toMatch(/superseded|done/i);

    // Feature should be marked done, not backlog
    expect(serviceCtx.featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-review-001',
      { status: 'done' }
    );

    // Should have emitted the merge event
    expect(serviceCtx.events.emit).toHaveBeenCalledWith(
      'feature:pr-merged',
      expect.objectContaining({ featureId: 'feat-review-001' })
    );
  });

  it('non-CONFLICTING PR (MERGEABLE) → continues normal REVIEW flow (no close)', async () => {
    const feature = makeFeature({ status: 'review', branchName: 'fix/test-fix' });
    const serviceCtx = makeServiceContext({ status: 'review', branchName: 'fix/test-fix' });
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    // getMergeableState returns MERGEABLE — should NOT trigger close_and_recut
    // subsequent calls handle normalizePR, getPRReviewState, etc.
    mockExecAsync
      .mockResolvedValueOnce({ stdout: '"MERGEABLE"', stderr: '' }) // getMergeableState
      .mockResolvedValue({ stdout: '{"body":"","autoMerge":false}', stderr: '' }); // normalizePR etc.

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature, 42);
    await processor.enter(ctx);
    await processor.process(ctx);

    // Should NOT have called gh pr close
    const execCalls = mockExecAsync.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(execCalls.some((cmd) => cmd.includes('gh pr close'))).toBe(false);

    // Feature should NOT have been reset to backlog by close_and_recut
    const updateCalls = (serviceCtx.featureLoader.update as ReturnType<typeof vi.fn>).mock.calls;
    const backlogReset = updateCalls.filter(
      (call: unknown[]) => (call[2] as Record<string, unknown>)?.status === 'backlog'
    );
    expect(backlogReset).toHaveLength(0);
  });
});
