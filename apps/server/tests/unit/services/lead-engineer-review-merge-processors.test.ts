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
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, exec: mockExec };
});

import {
  MergeProcessor,
  ReviewProcessor,
} from '../../../src/services/lead-engineer-review-merge-processors.js';
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
    retryCount: 0,
    infraRetryCount: 0,
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
      get: vi.fn().mockResolvedValue(undefined),
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
    settingsService: {
      getGlobalSettings: vi.fn().mockResolvedValue({ gitWorkflow: { softChecks: [] } }),
      getProjectSettings: vi.fn().mockResolvedValue({}),
    } as any,
    projectService: {} as any,
    metricsService: {} as any,
    prFeedbackService: {
      getTrackedPRs: vi.fn().mockReturnValue([]),
      isFeatureRemediating: vi.fn().mockReturnValue(false),
    } as any,
    ...overrides,
  };
}

// ── exec mock helper ─────────────────────────────────────────────────────────

/**
 * Creates a promisified exec mock implementation that calls cb(null, result).
 */
function execSuccess(result: { stdout: string; stderr: string }) {
  return (
    _cmd: string,
    _opts: unknown,
    cb: (err: null, result: { stdout: string; stderr: string }) => void
  ) => {
    cb(null, result);
  };
}

function execFailure(err: Error) {
  return (_cmd: string, _opts: unknown, cb: (err: Error) => void) => {
    cb(err);
  };
}

/**
 * Sets up the exec mock to simulate:
 *   1st call (gh pr view --json baseRefName): returns 'dev' (non-promotion branch)
 *   2nd call (gh pr merge): succeeds
 *   3rd call (gh pr view --json mergedAt): returns `mergeResult`
 *   4th call (gh pr view --json files): returns JSON list of changed file paths
 *
 * `changedFiles` defaults to a source file so existing merge tests are unaffected.
 */
function setupExecMock(mergeResult: string, changedFiles: string[] = ['src/index.ts']) {
  mockExec.mockReset();
  mockExec
    // First call: gh pr view --json baseRefName (promotion check)
    .mockImplementationOnce(
      (
        _cmd: string,
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void
      ) => {
        cb(null, { stdout: 'dev\n', stderr: '' });
      }
    )
    // Second call: gh pr merge
    .mockImplementationOnce(
      (
        _cmd: string,
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void
      ) => {
        cb(null, { stdout: '', stderr: '' });
      }
    )
    // Third call: gh pr view --json mergedAt
    .mockImplementationOnce(
      (
        _cmd: string,
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void
      ) => {
        cb(null, { stdout: mergeResult, stderr: '' });
      }
    )
    // Fourth call: gh pr view --json files (source-code gate)
    .mockImplementationOnce(
      (
        _cmd: string,
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void
      ) => {
        cb(null, { stdout: JSON.stringify(changedFiles), stderr: '' });
      }
    );
}

// ── tests ────────────────────────────────────────────────────────────────────

// ── ReviewProcessor tests ────────────────────────────────────────────────────

describe('ReviewProcessor', () => {
  let serviceContext: ProcessorServiceContext;
  let processor: ReviewProcessor;

  beforeEach(() => {
    mockExec.mockReset();
    serviceContext = makeServiceContext();
    processor = new ReviewProcessor(serviceContext);
  });

  describe('CI failure handling', () => {
    /**
     * Sets up exec mocks for the ReviewProcessor.process() call sequence when
     * CI checks fail on the PR:
     *
     *   Call 1 — normalizePR: gh pr view body/autoMerge → fail (caught, returns early)
     *   Call 2 — getPRReviewState merge check: PR is OPEN (not merged)
     *   Call 3 — getPRReviewState main: decision=null, CI check FAILURE
     *   Call 4 — ci_failed handler: fetch failing check names
     */
    function setupCiFailureExecMock(ciCheckName = 'CI / test') {
      mockExec.mockReset();
      mockExec
        // Call 1: normalizePR fails → caught, returns early
        .mockImplementationOnce(execFailure(new Error('normalizePR network error')))
        // Call 2: merge check — PR is OPEN
        .mockImplementationOnce(
          execSuccess({ stdout: JSON.stringify({ state: 'OPEN', mergedAt: null }), stderr: '' })
        )
        // Call 3: main review state check — CI failure
        .mockImplementationOnce(
          execSuccess({
            stdout: JSON.stringify({
              decision: null,
              checks: [{ name: ciCheckName, conclusion: 'FAILURE' }],
              approvedCount: 0,
            }),
            stderr: '',
          })
        )
        // Call 4: fetch CI failure names
        .mockImplementationOnce(execSuccess({ stdout: ciCheckName, stderr: '' }));
    }

    it('transitions to EXECUTE when CI checks fail', async () => {
      setupCiFailureExecMock('CI / build');
      const ctx = makeCtx({ feature: makeFeature() as any });

      const result = await processor.process(ctx);

      expect(result.nextState).toBe('EXECUTE');
      expect(result.shouldContinue).toBe(true);
    });

    it('includes failing check names in the transition reason', async () => {
      setupCiFailureExecMock('CI / lint');
      const ctx = makeCtx({ feature: makeFeature() as any });

      const result = await processor.process(ctx);

      expect(result.reason).toMatch(/CI\/lint|CI \/ lint/);
    });

    it('includes ciFailures in the transition context', async () => {
      setupCiFailureExecMock('CI / test');
      const ctx = makeCtx({ feature: makeFeature() as any });

      const result = await processor.process(ctx);

      expect((result.context as Record<string, unknown>)?.remediation).toBe(true);
    });

    it('increments remediationAttempts on CI failure', async () => {
      setupCiFailureExecMock('CI / test');
      const ctx = makeCtx({ feature: makeFeature() as any, remediationAttempts: 0 });

      await processor.process(ctx);

      expect(ctx.remediationAttempts).toBe(1);
    });

    it('escalates when CI remediation budget is exhausted', async () => {
      setupCiFailureExecMock('CI / test');
      // Exhaust the CI remediation budget (default maxCiRemediationCycles = 2)
      const ctx = makeCtx({
        feature: makeFeature({ ciRemediationCount: 2 }) as any,
        remediationAttempts: 0,
      });

      const result = await processor.process(ctx);

      expect(result.nextState).toBe('ESCALATE');
      expect(result.reason).toMatch(/budget exhausted/i);
    });

    it('does NOT treat CodeRabbit failures as CI failures', async () => {
      vi.useFakeTimers();
      mockExec.mockReset();
      mockExec
        // Call 1: normalizePR fails
        .mockImplementationOnce(execFailure(new Error('network')))
        // Call 2: merge check
        .mockImplementationOnce(
          execSuccess({ stdout: JSON.stringify({ state: 'OPEN', mergedAt: null }), stderr: '' })
        )
        // Call 3: CodeRabbit fails, no human approval yet
        .mockImplementationOnce(
          execSuccess({
            stdout: JSON.stringify({
              decision: null,
              checks: [{ name: 'coderabbit-review', conclusion: 'FAILURE' }],
              approvedCount: 0,
            }),
            stderr: '',
          })
        )
        // Fallback for any additional exec calls (e.g., CI detail queries)
        .mockImplementation(execSuccess({ stdout: '{}', stderr: '' }));

      const ctx = makeCtx({ feature: makeFeature() as any });
      // Start processing — hits 'pending' path which sleeps for REVIEW_POLL_DELAY_MS (30s)
      const resultPromise = processor.process(ctx);
      // Advance fake timers past the 30s poll delay so the promise resolves instantly
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await resultPromise;

      // CodeRabbit failures should be treated as transient — stay in REVIEW (pending)
      expect(result.nextState).toBe('REVIEW');
      vi.useRealTimers();
    });
  });
});

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

  describe('source-code gate (lock-only PR detection)', () => {
    it('escalates to ESCALATE when PR contains only .automaker-lock', async () => {
      setupExecMock('2026-01-01T00:00:00Z\n', ['.automaker-lock']);
      const ctx = makeCtx();

      const result = await processor.process(ctx);

      expect(result.nextState).toBe('ESCALATE');
      expect(result.reason).toMatch(/lock-only/);
    });

    it('sets feature status to blocked on lock-only merge', async () => {
      setupExecMock('2026-01-01T00:00:00Z\n', ['.automaker-lock']);
      const ctx = makeCtx();

      await processor.process(ctx);

      const updatePayload = (serviceContext.featureLoader.update as ReturnType<typeof vi.fn>).mock
        .calls[0][2];
      expect(updatePayload.status).toBe('blocked');
      expect(updatePayload.statusChangeReason).toMatch(/lock-only/);
    });

    it('escalates when PR contains only lock files and markdown', async () => {
      setupExecMock('2026-01-01T00:00:00Z\n', [
        '.automaker-lock',
        'pnpm-lock.yaml',
        'README.md',
      ]);
      const ctx = makeCtx();

      const result = await processor.process(ctx);

      expect(result.nextState).toBe('ESCALATE');
    });

    it('proceeds to DEPLOY when PR contains source files alongside metadata', async () => {
      setupExecMock('2026-01-01T00:00:00Z\n', [
        '.automaker-lock',
        'src/services/my-service.ts',
      ]);
      const ctx = makeCtx();

      const result = await processor.process(ctx);

      expect(result.nextState).toBe('DEPLOY');
    });

    it('treats files in filesToModify as source even if they are markdown', async () => {
      setupExecMock('2026-01-01T00:00:00Z\n', ['docs/api.md']);
      const ctx = makeCtx({
        feature: makeFeature({ filesToModify: ['docs/api.md'] }) as any,
      });

      const result = await processor.process(ctx);

      expect(result.nextState).toBe('DEPLOY');
    });

    it('proceeds to DEPLOY when diff inspection fails (non-fatal)', async () => {
      mockExec.mockReset();
      mockExec
        // Call 1: baseRefName
        .mockImplementationOnce(execSuccess({ stdout: 'dev\n', stderr: '' }))
        // Call 2: gh pr merge
        .mockImplementationOnce(execSuccess({ stdout: '', stderr: '' }))
        // Call 3: gh pr view mergedAt
        .mockImplementationOnce(execSuccess({ stdout: '2026-01-01T00:00:00Z\n', stderr: '' }))
        // Call 4: gh pr view --json files — fails
        .mockImplementationOnce(execFailure(new Error('gh CLI unavailable')));

      const ctx = makeCtx();
      const result = await processor.process(ctx);

      // Diff failure is non-fatal — should proceed as done
      expect(result.nextState).toBe('DEPLOY');
    });

    it('proceeds to DEPLOY when PR has empty file list (unusual case)', async () => {
      setupExecMock('2026-01-01T00:00:00Z\n', []);
      const ctx = makeCtx();

      const result = await processor.process(ctx);

      expect(result.nextState).toBe('DEPLOY');
    });
  });
});
