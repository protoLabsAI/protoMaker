/**
 * Unit tests for the REVIEW-phase bot-review feedback audit gate (#3901).
 *
 * Verifies gateBotReviewFeedback's decision branches:
 *  - no trajectory store / human review present → fall through (null)
 *  - reasoning audit VALID    → fall through (remediate)
 *  - reasoning audit UNCERTAIN → escalate
 *  - reasoning audit INVALID   → dismiss bot review + persist loop-guard + re-check
 *  - loop guard (already dismissed 2x on this head) → escalate without auditing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// REVIEW_POLL_DELAY_MS is parsed from env at module load; zero it so the
// INVALID path's post-dismissal wait is instant. (hoisted → runs before imports)
vi.hoisted(() => {
  process.env.REVIEW_POLL_DELAY_MS = '0';
});

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { mockExec } = vi.hoisted(() => ({ mockExec: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, exec: mockExec };
});

const { mockSimpleQuery } = vi.hoisted(() => ({ mockSimpleQuery: vi.fn() }));
vi.mock('../../../src/providers/simple-query-service.js', () => ({
  simpleQuery: mockSimpleQuery,
}));

import { ReviewProcessor } from '../../../src/services/lead-engineer-review-merge-processors.js';
import type {
  ProcessorServiceContext,
  StateContext,
} from '../../../src/services/lead-engineer-types.js';

function makeCtx(featureOverrides: Record<string, unknown> = {}): StateContext {
  return {
    feature: {
      id: 'feat-001',
      title: 'Install rh',
      description: 'Add the rh CLI to the image',
      status: 'in-progress',
      ...featureOverrides,
    },
    projectPath: '/test/project',
    retryCount: 0,
    infraRetryCount: 0,
    planRequired: false,
    remediationAttempts: 0,
    mergeRetryCount: 0,
    planRetryCount: 0,
    prNumber: 42,
  } as unknown as StateContext;
}

function makeServiceContext(
  overrides: Partial<ProcessorServiceContext> = {}
): ProcessorServiceContext {
  return {
    featureLoader: { update: vi.fn().mockResolvedValue(undefined), get: vi.fn() } as any,
    events: { emit: vi.fn() } as any,
    autoModeService: {} as any,
    settingsService: {
      getGlobalSettings: vi.fn().mockResolvedValue({}),
      getProjectSettings: vi.fn().mockResolvedValue({}),
    } as any,
    trajectoryStoreService: {
      loadTrajectories: vi.fn().mockResolvedValue([]),
    } as any,
    ...overrides,
  } as ProcessorServiceContext;
}

/** Route exec calls by command substring (callback style for promisify). */
function routeExec(reviewsJson: string) {
  return (
    cmd: string,
    _opts: unknown,
    cb: (e: null, r: { stdout: string; stderr: string }) => void
  ) => {
    const ok = (stdout: string) => cb(null, { stdout, stderr: '' });
    if (cmd.includes('repo view')) return ok('protoLabsAI/protoMaker\n');
    if (cmd.includes('--json headRefOid')) return ok('abc1234deadbeef\n');
    if (cmd.includes('/reviews') && !cmd.includes('dismissals')) return ok(reviewsJson);
    if (cmd.includes('pr diff')) return ok('diff --git a/Dockerfile b/Dockerfile\n+RUN ...');
    if (cmd.includes('statusCheckRollup')) return ok('[]');
    if (cmd.includes('dismissals')) return ok('{}');
    if (cmd.includes('pr comment')) return ok('');
    return ok('');
  };
}

const BOT_CR = JSON.stringify([
  {
    id: 999,
    user: { login: 'protoquinn[bot]' },
    state: 'CHANGES_REQUESTED',
    body: 'frozen-lockfile deadlock',
  },
]);
const HUMAN_CR = JSON.stringify([
  {
    id: 1,
    user: { login: 'mabry1985' },
    state: 'CHANGES_REQUESTED',
    body: 'please fix the naming',
  },
]);

describe('ReviewProcessor.gateBotReviewFeedback (#3901)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls through (null) when no trajectory store is available', async () => {
    const proc = new ReviewProcessor(makeServiceContext({ trajectoryStoreService: undefined }));
    const result = await (proc as any).gateBotReviewFeedback(makeCtx());
    expect(result).toBeNull();
    expect(mockSimpleQuery).not.toHaveBeenCalled();
  });

  it('falls through (null) when a human requested changes (never auto-dismissed)', async () => {
    mockExec.mockImplementation(routeExec(HUMAN_CR));
    const proc = new ReviewProcessor(makeServiceContext());
    const result = await (proc as any).gateBotReviewFeedback(makeCtx());
    expect(result).toBeNull();
    expect(mockSimpleQuery).not.toHaveBeenCalled();
  });

  it('falls through (null) on a VALID audit verdict (remediate the real finding)', async () => {
    mockExec.mockImplementation(routeExec(BOT_CR));
    mockSimpleQuery.mockResolvedValue({ text: 'VALID: the endpoint lacks input validation.' });
    const proc = new ReviewProcessor(makeServiceContext());
    const result = await (proc as any).gateBotReviewFeedback(makeCtx());
    expect(result).toBeNull();
    expect(mockSimpleQuery).toHaveBeenCalledTimes(1);
  });

  it('escalates on an UNCERTAIN audit verdict', async () => {
    mockExec.mockImplementation(routeExec(BOT_CR));
    mockSimpleQuery.mockResolvedValue({ text: 'UNCERTAIN: needs context beyond the diff.' });
    const proc = new ReviewProcessor(makeServiceContext());
    const result = await (proc as any).gateBotReviewFeedback(makeCtx());
    expect(result?.nextState).toBe('ESCALATE');
  });

  it('dismisses the bot review and persists loop-guard state on INVALID', async () => {
    mockExec.mockImplementation(routeExec(BOT_CR));
    mockSimpleQuery.mockResolvedValue({
      text: 'INVALID: shallow clone includes the committed lockfile; premise is false.',
    });
    const svc = makeServiceContext();
    const proc = new ReviewProcessor(svc);
    const result = await (proc as any).gateBotReviewFeedback(makeCtx());

    expect(result?.nextState).toBe('REVIEW');
    // dismissal call landed
    const calls = mockExec.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes('/reviews/999/dismissals'))).toBe(true);
    // loop-guard persisted
    expect(svc.featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-001',
      expect.objectContaining({
        reviewAuditDismissSha: 'abc1234deadbeef',
        reviewAuditDismissCount: 1,
      })
    );
  });

  it('escalates (loop guard) when already dismissed 2x on the same head', async () => {
    mockExec.mockImplementation(routeExec(BOT_CR));
    const proc = new ReviewProcessor(makeServiceContext());
    const ctx = makeCtx({ reviewAuditDismissSha: 'abc1234deadbeef', reviewAuditDismissCount: 2 });
    const result = await (proc as any).gateBotReviewFeedback(ctx);
    expect(result?.nextState).toBe('ESCALATE');
    // audit never runs — short-circuited by the loop guard
    expect(mockSimpleQuery).not.toHaveBeenCalled();
  });
});
