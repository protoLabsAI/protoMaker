/**
 * Unit tests for MergeProcessor
 *
 * Verifies that after a successful merge, the feature is updated with
 * prMergedAt, completedAt, and optionally prReviewDurationMs.
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

// Mock node:child_process — use vi.hoisted so mockExec is available inside the factory
const { mockExec } = vi.hoisted(() => ({ mockExec: vi.fn() }));
vi.mock('node:child_process', () => ({
  exec: mockExec,
}));

import { MergeProcessor } from '../../../src/services/lead-engineer-review-merge-processors.js';
import type {
  ProcessorServiceContext,
  StateContext,
} from '../../../src/services/lead-engineer-types.js';

// ── helpers ─────────────────────────────────────────────────────────────────

function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feat-001',
    title: 'Test Feature',
    description: 'A test feature',
    status: 'in-progress' as const,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    order: 0,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<StateContext> = {}): StateContext {
  return {
    feature: makeFeature() as any,
    projectPath: '/test/project',
    options: {},
    retryCount: 0,
    planRequired: false,
    remediationAttempts: 0,
    mergeRetryCount: 0,
    planRetryCount: 0,
    prNumber: 42,
    ...overrides,
  } as StateContext;
}

function makeServiceContext(
  overrides: Partial<ProcessorServiceContext> = {}
): ProcessorServiceContext {
  return {
    featureLoader: {
      update: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn(),
      get: vi.fn(),
      findByTitle: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      claim: vi.fn(),
      release: vi.fn(),
      setEventEmitter: vi.fn(),
      setIntegrityWatchdog: vi.fn(),
    } as any,
    events: {
      emit: vi.fn(),
      subscribe: vi.fn(),
      on: vi.fn(),
    } as any,
    autoModeService: {} as any,
    settingsService: {} as any,
    projectService: {} as any,
    metricsService: {} as any,
    prFeedbackService: { getTrackedPRs: vi.fn().mockReturnValue([]) } as any,
    ...overrides,
  };
}

// ── exec mock helper ─────────────────────────────────────────────────────────

/**
 * Sets up the exec mock to simulate:
 *   1st call (gh pr merge): succeeds
 *   2nd call (gh pr view --json merged): returns `mergeResult`
 */
function setupExecMock(mergeResult: string) {
  mockExec.mockReset();
  mockExec
    // First call: gh pr merge
    .mockImplementationOnce(
      (
        _cmd: string,
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void
      ) => {
        cb(null, { stdout: '', stderr: '' });
      }
    )
    // Second call: gh pr view --json merged
    .mockImplementationOnce(
      (
        _cmd: string,
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void
      ) => {
        cb(null, { stdout: mergeResult, stderr: '' });
      }
    );
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('MergeProcessor', () => {
  let serviceContext: ProcessorServiceContext;
  let processor: MergeProcessor;

  beforeEach(() => {
    mockExec.mockReset();
    serviceContext = makeServiceContext();
    processor = new MergeProcessor(serviceContext);
  });

  describe('successful merge', () => {
    it('sets prMergedAt on the feature update', async () => {
      setupExecMock('true\n');
      const before = Date.now();
      const ctx = makeCtx();

      await processor.process(ctx);

      const updateCalls = (serviceContext.featureLoader.update as ReturnType<typeof vi.fn>).mock
        .calls;
      expect(updateCalls).toHaveLength(1);

      const updatePayload = updateCalls[0][2];
      expect(updatePayload).toHaveProperty('prMergedAt');

      const mergedAt = new Date(updatePayload.prMergedAt as string).getTime();
      expect(mergedAt).toBeGreaterThanOrEqual(before);
      expect(mergedAt).toBeLessThanOrEqual(Date.now());
    });

    it('sets completedAt on the feature update', async () => {
      setupExecMock('true\n');
      const ctx = makeCtx();

      await processor.process(ctx);

      const updatePayload = (serviceContext.featureLoader.update as ReturnType<typeof vi.fn>).mock
        .calls[0][2];
      expect(updatePayload).toHaveProperty('completedAt');
      expect(typeof updatePayload.completedAt).toBe('string');
    });

    it('sets status to done', async () => {
      setupExecMock('true\n');
      const ctx = makeCtx();

      await processor.process(ctx);

      const updatePayload = (serviceContext.featureLoader.update as ReturnType<typeof vi.fn>).mock
        .calls[0][2];
      expect(updatePayload.status).toBe('done');
    });

    it('computes prReviewDurationMs when prCreatedAt is available', async () => {
      setupExecMock('true\n');
      const prCreatedAt = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago
      const ctx = makeCtx({ feature: makeFeature({ prCreatedAt }) as any });

      await processor.process(ctx);

      const updatePayload = (serviceContext.featureLoader.update as ReturnType<typeof vi.fn>).mock
        .calls[0][2];
      expect(updatePayload).toHaveProperty('prReviewDurationMs');
      expect(typeof updatePayload.prReviewDurationMs).toBe('number');
      // Should be approximately 1 hour (within a generous tolerance)
      expect(updatePayload.prReviewDurationMs).toBeGreaterThan(3500_000);
      expect(updatePayload.prReviewDurationMs).toBeLessThan(3700_000);
    });

    it('omits prReviewDurationMs when prCreatedAt is not available', async () => {
      setupExecMock('true\n');
      const ctx = makeCtx({ feature: makeFeature() as any }); // no prCreatedAt

      await processor.process(ctx);

      const updatePayload = (serviceContext.featureLoader.update as ReturnType<typeof vi.fn>).mock
        .calls[0][2];
      expect(updatePayload).not.toHaveProperty('prReviewDurationMs');
    });

    it('transitions to DEPLOY state after successful merge', async () => {
      setupExecMock('true\n');
      const ctx = makeCtx();

      const result = await processor.process(ctx);

      expect(result.nextState).toBe('DEPLOY');
      expect(result.shouldContinue).toBe(true);
    });
  });
});
