/**
 * Golden eval scenarios — REVIEW phase bot-feedback audit gate (#3904 / #3901).
 *
 * Drives the real ReviewProcessor.gateBotReviewFeedback over a representative
 * set of review situations (mocked gh + reasoning model) and records the
 * decision into the shared scorecard. Each scenario asserts the decision (so a
 * regression also fails the run) AND contributes to the aggregate success rate.
 */

import { describe, it, expect, afterAll, vi, beforeEach } from 'vitest';
import { record, writeScorecard, type EvalDomain } from './scorecard.js';

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
vi.mock('../src/providers/simple-query-service.js', () => ({ simpleQuery: mockSimpleQuery }));

import { ReviewProcessor } from '../src/services/lead-engineer-review-merge-processors.js';
import { ExecuteProcessor } from '../src/services/lead-engineer-execute-processor.js';
import type { ProcessorServiceContext, StateContext } from '../src/services/lead-engineer-types.js';

const DOMAIN: EvalDomain = 'review';

function ctx(featureOverrides: Record<string, unknown> = {}): StateContext {
  return {
    feature: {
      id: 'eval-feat',
      title: 'Eval feature',
      description: 'desc',
      status: 'in-progress',
      ...featureOverrides,
    },
    projectPath: '/eval/project',
    retryCount: 0,
    infraRetryCount: 0,
    planRequired: false,
    remediationAttempts: 0,
    mergeRetryCount: 0,
    planRetryCount: 0,
    prNumber: 42,
  } as unknown as StateContext;
}

function svc(overrides: Partial<ProcessorServiceContext> = {}): ProcessorServiceContext {
  return {
    featureLoader: { update: vi.fn().mockResolvedValue(undefined), get: vi.fn() } as any,
    events: { emit: vi.fn() } as any,
    autoModeService: {} as any,
    settingsService: {
      getGlobalSettings: vi.fn().mockResolvedValue({}),
      getProjectSettings: vi.fn().mockResolvedValue({}),
    } as any,
    trajectoryStoreService: { loadTrajectories: vi.fn().mockResolvedValue([]) } as any,
    ...overrides,
  } as ProcessorServiceContext;
}

function routeExec(reviewsJson: string) {
  return (
    cmd: string,
    _o: unknown,
    cb: (e: null, r: { stdout: string; stderr: string }) => void
  ) => {
    const ok = (stdout: string) => cb(null, { stdout, stderr: '' });
    if (cmd.includes('repo view')) return ok('protoLabsAI/protoMaker\n');
    if (cmd.includes('--json headRefOid')) return ok('abc1234deadbeef\n');
    if (cmd.includes('/reviews') && !cmd.includes('dismissals')) return ok(reviewsJson);
    if (cmd.includes('pr diff')) return ok('diff --git a/x b/x');
    if (cmd.includes('statusCheckRollup')) return ok('[]');
    return ok('');
  };
}

const botCR = JSON.stringify([
  { id: 999, user: { login: 'protoquinn[bot]' }, state: 'CHANGES_REQUESTED', body: 'finding' },
]);
const humanCR = JSON.stringify([
  { id: 1, user: { login: 'mabry1985' }, state: 'CHANGES_REQUESTED', body: 'please fix' },
]);

/** Classify a gate result into a comparable decision label. */
function decision(result: { nextState?: string } | null): string {
  if (result === null) return 'passthrough';
  if (result.nextState === 'ESCALATE') return 'escalate';
  if (result.nextState === 'REVIEW') return 'dismiss-recheck';
  return `other:${result.nextState}`;
}

interface Scenario {
  id: string;
  description: string;
  expected: string;
  setup: () => { proc: ReviewProcessor; context: StateContext };
}

const scenarios: Scenario[] = [
  {
    id: 'review-bot-cr-valid-remediates',
    description: 'Bot CHANGES_REQUESTED judged VALID → pass through to remediation',
    expected: 'passthrough',
    setup: () => {
      mockExec.mockImplementation(routeExec(botCR));
      mockSimpleQuery.mockResolvedValue({ text: 'VALID: real defect in the diff.' });
      return { proc: new ReviewProcessor(svc()), context: ctx() };
    },
  },
  {
    id: 'review-bot-cr-invalid-dismisses',
    description: 'Bot CHANGES_REQUESTED judged INVALID → dismiss + re-check',
    expected: 'dismiss-recheck',
    setup: () => {
      mockExec.mockImplementation(routeExec(botCR));
      mockSimpleQuery.mockResolvedValue({ text: 'INVALID: premise is false; no real defect.' });
      return { proc: new ReviewProcessor(svc()), context: ctx() };
    },
  },
  {
    id: 'review-bot-cr-uncertain-escalates',
    description: 'Bot CHANGES_REQUESTED judged UNCERTAIN → escalate to human',
    expected: 'escalate',
    setup: () => {
      mockExec.mockImplementation(routeExec(botCR));
      mockSimpleQuery.mockResolvedValue({ text: 'UNCERTAIN: cannot adjudicate from the diff.' });
      return { proc: new ReviewProcessor(svc()), context: ctx() };
    },
  },
  {
    id: 'review-human-cr-never-audited',
    description: 'Human CHANGES_REQUESTED → never audited, pass through to remediation',
    expected: 'passthrough',
    setup: () => {
      mockExec.mockImplementation(routeExec(humanCR));
      return { proc: new ReviewProcessor(svc()), context: ctx() };
    },
  },
  {
    id: 'review-loop-guard-escalates',
    description: 'Bot re-CR on a head already dismissed 2x → escalate (loop guard)',
    expected: 'escalate',
    setup: () => {
      mockExec.mockImplementation(routeExec(botCR));
      return {
        proc: new ReviewProcessor(svc()),
        context: ctx({ reviewAuditDismissSha: 'abc1234deadbeef', reviewAuditDismissCount: 2 }),
      };
    },
  },
  {
    id: 'review-no-trajectory-skips',
    description: 'No trajectory store → gate skips, pass through',
    expected: 'passthrough',
    setup: () => {
      mockExec.mockImplementation(routeExec(botCR));
      return {
        proc: new ReviewProcessor(svc({ trajectoryStoreService: undefined })),
        context: ctx(),
      };
    },
  },
];

describe('eval: REVIEW bot-feedback audit gate', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const s of scenarios) {
    it(s.id, async () => {
      const { proc, context } = s.setup();
      const result = await (proc as any).gateBotReviewFeedback(context);
      const actual = decision(result);
      const passed = actual === s.expected;
      record({
        id: s.id,
        domain: DOMAIN,
        description: s.description,
        expected: s.expected,
        actual,
        passed,
        metrics: { escalated: actual === 'escalate' },
      });
      expect(actual).toBe(s.expected);
    });
  }
});

// ── EXECUTE domain: verifier-evidence gate (beads zg4) ───────────────────────
// Drives the real ExecuteProcessor.runVerificationGate with the gate setting
// supplied via the mocked settingsService (no module mock — keeps the REVIEW
// scenarios' real getWorkflowSettings intact) and a stubbed worktree resolver.

function execSvc(requireVerificationEvidence: unknown): ProcessorServiceContext {
  return {
    featureLoader: { update: vi.fn().mockResolvedValue(undefined), get: vi.fn() } as any,
    events: { emit: vi.fn() } as any,
    autoModeService: {} as any,
    settingsService: {
      getGlobalSettings: vi.fn().mockResolvedValue({}),
      getProjectSettings: vi.fn().mockResolvedValue({ workflow: { requireVerificationEvidence } }),
    } as any,
  } as ProcessorServiceContext;
}

function execCtx(): StateContext {
  return {
    feature: { id: 'eval-exec', title: 'Eval execute', branchName: 'feature/x' },
    projectPath: '/eval/project',
  } as unknown as StateContext;
}

const cmdPass = (
  _c: string,
  _o: unknown,
  cb: (e: null, r: { stdout: string; stderr: string }) => void
) => cb(null, { stdout: '', stderr: '' });
const cmdFail = (_c: string, _o: unknown, cb: (e: Error) => void) => cb(new Error('tsc failed'));

interface ExecScenario {
  id: string;
  description: string;
  expected: string;
  setup: () => { proc: ExecuteProcessor; context: StateContext };
}

const execScenarios: ExecScenario[] = [
  {
    id: 'execute-verify-pass-proceeds',
    description: 'Verifier gate enabled + check passes → pass (proceed to REVIEW)',
    expected: 'pass',
    setup: () => {
      mockExec.mockImplementation(cmdPass);
      const proc = new ExecuteProcessor(execSvc({ enabled: true, command: 'npm run typecheck' }));
      (proc as any).resolveWorktreeDir = vi.fn().mockResolvedValue('/wt');
      return { proc, context: execCtx() };
    },
  },
  {
    id: 'execute-verify-fail-blocks',
    description: 'Verifier gate enabled + check fails → fail (blocks before REVIEW)',
    expected: 'fail',
    setup: () => {
      mockExec.mockImplementation(cmdFail);
      const proc = new ExecuteProcessor(execSvc({ enabled: true }));
      (proc as any).resolveWorktreeDir = vi.fn().mockResolvedValue('/wt');
      return { proc, context: execCtx() };
    },
  },
  {
    id: 'execute-verify-disabled-skips',
    description: 'Verifier gate disabled → skipped (no run, no gate)',
    expected: 'skipped',
    setup: () => {
      const proc = new ExecuteProcessor(execSvc({ enabled: false }));
      (proc as any).resolveWorktreeDir = vi.fn().mockResolvedValue('/wt');
      return { proc, context: execCtx() };
    },
  },
];

describe('eval: EXECUTE verifier-evidence gate', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const s of execScenarios) {
    it(s.id, async () => {
      const { proc, context } = s.setup();
      const actual = await (proc as any).runVerificationGate(context);
      const passed = actual === s.expected;
      record({
        id: s.id,
        domain: 'execute',
        description: s.description,
        expected: s.expected,
        actual: String(actual),
        passed,
      });
      expect(actual).toBe(s.expected);
    });
  }
});

// Top-level: write the aggregate scorecard after every domain's scenarios run.
afterAll(() => {
  const card = writeScorecard(new URL('./scorecard.json', import.meta.url).pathname);
  console.log(
    `[eval] scorecard: ${card.passed}/${card.total} passed (successRate ${card.successRate})`
  );
});
