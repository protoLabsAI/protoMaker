/**
 * Unit tests for fresh-eyes review in ReviewProcessor.
 *
 * Covers PASS, CONCERN, and BLOCK verdict paths.
 *
 * Mock call order in ReviewProcessor.process() when reviewState === 'approved':
 * 1. gh pr list --head ... --state merged   (checkBranchMerged)
 * 2. gh pr view --json body,autoMergeRequest (normalizePR)
 * 3. gh pr view --json state,mergedAt        (getPRReviewState merged fast-path)
 * 4. gh pr view --json reviewDecision,...    (getPRReviewState review decision)
 * 5. gh pr diff                              (runFreshEyesReview)
 * 6. gh pr comment                          (runFreshEyesReview — CONCERN/BLOCK only)
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

const { mockExecAsync, mockSimpleQuery, mockGetWorkflowSettings } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
  mockSimpleQuery: vi.fn(),
  mockGetWorkflowSettings: vi.fn(),
}));

vi.mock('node:child_process', () => ({ exec: vi.fn() }));
vi.mock('node:util', () => ({ promisify: () => mockExecAsync }));

vi.mock('@/providers/simple-query-service.js', () => ({
  simpleQuery: mockSimpleQuery,
}));

vi.mock('@/lib/settings-helpers.js', () => ({
  getWorkflowSettings: mockGetWorkflowSettings,
  getPhaseModelWithOverrides: vi.fn(),
}));

vi.mock('@protolabsai/model-resolver', () => ({
  resolveModelString: (alias: string) => `claude-haiku-resolved-${alias}`,
  DEFAULT_MODELS: {
    claude: 'claude-opus-4-6',
    autoMode: 'claude-sonnet-4-6',
    trivial: 'claude-haiku-4-5-20251001',
  },
}));

import { ReviewProcessor } from '../../../../src/services/lead-engineer-review-merge-processors.js';
import type {
  ProcessorServiceContext,
  StateContext,
} from '../../../../src/services/lead-engineer-types.js';
import type { Feature } from '@protolabsai/types';

// ── helpers ──────────────────────────────────────────────────────────────────

/** A valid Automaker ownership watermark that parsePROwnershipWatermark will recognize */
const VALID_WATERMARK =
  '<!-- automaker:owner instance=test-instance team=test-team created=2024-01-01T00:00:00.000Z -->';

/** Approved PR review state JSON (for getPRReviewState gh CLI fallback) */
const APPROVED_STATE = JSON.stringify({ decision: 'APPROVED', checks: [], approvedCount: 1 });

/** normalizePR response: watermark present, auto-merge already on → no further gh calls */
const NORMALIZE_RESPONSE = JSON.stringify({ body: VALID_WATERMARK, autoMerge: true });

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-fresh-001',
    title: 'Add fresh-eyes review',
    description: 'Implement a haiku review step after CI passes.',
    status: 'review',
    category: 'feature',
    branchName: 'feature/fresh-eyes',
    prNumber: 42,
    ...overrides,
  } as unknown as Feature;
}

function makeCtx(feature: Feature): StateContext {
  return {
    feature,
    projectPath: '/test/project',
    retryCount: 0,
    infraRetryCount: 0,
    planRequired: false,
    remediationAttempts: 0,
    mergeRetryCount: 0,
    planRetryCount: 0,
    prNumber: 42,
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
      getAll: vi.fn().mockResolvedValue([feature]),
    } as unknown as ProcessorServiceContext['featureLoader'],
    settingsService: {
      getGlobalSettings: vi.fn().mockResolvedValue({ gitWorkflow: { prMergeStrategy: 'squash' } }),
    } as unknown as ProcessorServiceContext['settingsService'],
  } as unknown as ProcessorServiceContext;
}

function workflowSettingsWithFreshEyes(enabled = true, model = 'haiku') {
  return {
    pipeline: { antagonisticPlanReview: false },
    freshEyesReview: { enabled, model },
  };
}

/** Set up the standard sequence of execAsync mocks for an approved PR with fresh-eyes enabled */
function setupApprovedExecMocks(extraCalls: { stdout: string; stderr: string }[] = []) {
  mockExecAsync
    .mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkBranchMerged → not merged
    .mockResolvedValueOnce({ stdout: '"MERGEABLE"', stderr: '' }) // getMergeableState → no conflict
    .mockResolvedValueOnce({ stdout: NORMALIZE_RESPONSE, stderr: '' }) // normalizePR body/autoMerge
    .mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'OPEN', mergedAt: null }),
      stderr: '',
    }) // getPRReviewState → merged fast-path check (not merged)
    .mockResolvedValueOnce({ stdout: APPROVED_STATE, stderr: '' }) // getPRReviewState → review decision
    .mockResolvedValueOnce({
      stdout: 'diff --git a/foo.ts b/foo.ts\n+const x = 1;\n',
      stderr: '',
    }); // gh pr diff

  for (const call of extraCalls) {
    mockExecAsync.mockResolvedValueOnce(call);
  }
}

/** Set up mocks for an approved PR with fresh-eyes disabled (no diff fetch needed) */
function setupApprovedExecMocksDisabled() {
  mockExecAsync
    .mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkBranchMerged
    .mockResolvedValueOnce({ stdout: '"MERGEABLE"', stderr: '' }) // getMergeableState → no conflict
    .mockResolvedValueOnce({ stdout: NORMALIZE_RESPONSE, stderr: '' }) // normalizePR
    .mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'OPEN', mergedAt: null }),
      stderr: '',
    }) // getPRReviewState → merged fast-path check (not merged)
    .mockResolvedValueOnce({ stdout: APPROVED_STATE, stderr: '' }); // getPRReviewState → review decision
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ReviewProcessor — fresh-eyes review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWorkflowSettings.mockResolvedValue(workflowSettingsWithFreshEyes());
  });

  it('PASS verdict → proceeds to MERGE without posting a PR comment', async () => {
    setupApprovedExecMocks(); // no extra calls — PASS does not comment
    mockSimpleQuery.mockResolvedValue({ text: 'PASS The diff correctly implements the feature.' });

    const feature = makeFeature({ status: 'review' });
    const serviceCtx = makeServiceContext({ status: 'review' });
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    expect(result.nextState).toBe('MERGE');
    expect(result.shouldContinue).toBe(true);

    // No PR comment for PASS
    const commentCalls = (mockExecAsync as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('pr comment')
    );
    expect(commentCalls).toHaveLength(0);

    // costUsd should be updated
    expect(serviceCtx.featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-fresh-001',
      expect.objectContaining({ costUsd: expect.any(Number) })
    );
  });

  it('CONCERN verdict → posts PR comment and still proceeds to MERGE', async () => {
    setupApprovedExecMocks([{ stdout: '', stderr: '' }]); // extra call: gh pr comment
    mockSimpleQuery.mockResolvedValue({
      text: 'CONCERN: Missing error handling in the catch block.',
    });

    const feature = makeFeature({ status: 'review' });
    const serviceCtx = makeServiceContext({ status: 'review' });
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    expect(result.nextState).toBe('MERGE');
    expect(result.shouldContinue).toBe(true);

    // PR comment should be posted
    const commentCalls = (mockExecAsync as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('pr comment')
    );
    expect(commentCalls).toHaveLength(1);
    expect(commentCalls[0][0]).toContain('CONCERN');

    // costUsd tracked
    expect(serviceCtx.featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-fresh-001',
      expect.objectContaining({ costUsd: expect.any(Number) })
    );
  });

  it('BLOCK verdict → posts PR comment and escalates (does not merge)', async () => {
    setupApprovedExecMocks([{ stdout: '', stderr: '' }]); // extra call: gh pr comment
    mockSimpleQuery.mockResolvedValue({
      text: 'BLOCK: Security vulnerability — user input passed directly to eval().',
    });

    const feature = makeFeature({ status: 'review' });
    const serviceCtx = makeServiceContext({ status: 'review' });
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    expect(result.nextState).toBe('ESCALATE');
    expect(result.shouldContinue).toBe(true);
    expect(result.reason).toMatch(/fresh-eyes review BLOCK/i);

    // PR comment posted with BLOCK message
    const commentCalls = (mockExecAsync as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('pr comment')
    );
    expect(commentCalls).toHaveLength(1);
    expect(commentCalls[0][0]).toContain('BLOCK');
  });

  it('fresh-eyes disabled → skips review and proceeds to MERGE without calling simpleQuery', async () => {
    mockGetWorkflowSettings.mockResolvedValue(workflowSettingsWithFreshEyes(false));
    setupApprovedExecMocksDisabled();

    const feature = makeFeature({ status: 'review' });
    const serviceCtx = makeServiceContext({ status: 'review' });
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    expect(result.nextState).toBe('MERGE');
    expect(mockSimpleQuery).not.toHaveBeenCalled();
  });
});
