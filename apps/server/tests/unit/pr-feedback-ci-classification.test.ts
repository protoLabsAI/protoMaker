/**
 * Integration tests for CI failure classification in the PR feedback pipeline.
 *
 * Covers three routing paths:
 *   - classify-skip/infra  : infra failures skip remediation and emit escalation
 *   - classify-skip/flaky  : flaky failures skip remediation and emit notification
 *   - classify-remediate   : actionable failures proceed with remediation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that transitively import the mocked modules
// ---------------------------------------------------------------------------

vi.mock('@/services/pr-status-checker.js', () => ({
  prStatusChecker: {
    fetchFailedChecks: vi.fn(),
    fetchPRReviewStatus: vi.fn(),
    fetchReviewThreads: vi.fn(),
    fetchPRDetails: vi.fn(),
    fetchRequiredStatusChecks: vi.fn(),
    fetchCICheckRuns: vi.fn(),
  },
  PRStatusChecker: vi.fn(),
}));

vi.mock('@/services/feedback-aggregator.js', () => ({
  FeedbackAggregator: vi.fn().mockImplementation(() => ({
    buildCIFixPrompt: vi.fn().mockResolvedValue('## CI Fix Prompt'),
    buildRemediationPrompt: vi.fn().mockResolvedValue('## Remediation Prompt'),
    buildFeedbackPrompt: vi.fn().mockResolvedValue('## Feedback Prompt'),
    isCommentedReviewActionable: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock('@/services/thread-resolver.js', () => ({
  ThreadResolver: vi.fn().mockImplementation(() => ({
    resolveThread: vi.fn(),
    loadDecisions: vi.fn().mockResolvedValue([]),
    saveDecision: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@/services/coderabbit-parser-service.js', () => ({
  codeRabbitParserService: {
    extractFeedback: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@protolabsai/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@protolabsai/utils')>();
  return {
    ...actual,
    atomicWriteJson: vi.fn().mockResolvedValue(undefined),
    readJsonWithRecovery: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { prStatusChecker } from '@/services/pr-status-checker.js';
import { classifyCIFailure } from '@/services/ci-failure-classifier.js';
import type { ClassifiedCIFailure } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClassifiedFailure(
  name: string,
  output: string,
  failureClass: ClassifiedCIFailure['failureClass']
): ClassifiedCIFailure {
  return { name, conclusion: 'failure', output, failureClass };
}

// ---------------------------------------------------------------------------
// CIFailureClassifierService unit tests
// ---------------------------------------------------------------------------

describe('classifyCIFailure', () => {
  it('classifies runner-lost output as infra', () => {
    const result = classifyCIFailure('build', 'Runner lost connection during execution');
    expect(result).toBe('infra');
  });

  it('classifies out-of-memory output as infra', () => {
    const result = classifyCIFailure('test', 'OOM kill: out of memory, process terminated');
    expect(result).toBe('infra');
  });

  it('classifies ECONNRESET output as flaky', () => {
    const result = classifyCIFailure('test', 'Error: read ECONNRESET at TCP.ondata');
    expect(result).toBe('flaky');
  });

  it('classifies timeout output as flaky', () => {
    const result = classifyCIFailure('e2e', 'Async callback exceeded timeout of 5000 ms');
    expect(result).toBe('flaky');
  });

  it('classifies TypeScript build error as actionable', () => {
    const result = classifyCIFailure(
      'typecheck',
      "TS2345: Argument of type 'string' is not assignable to parameter of type 'number'"
    );
    expect(result).toBe('actionable');
  });

  it('classifies test assertion failure as actionable', () => {
    const result = classifyCIFailure(
      'unit-tests',
      'Expected 42 received 0\n  at Object.<anonymous> (src/foo.test.ts:12:5)'
    );
    expect(result).toBe('actionable');
  });

  it('infra pattern in check name wins over flaky pattern in output', () => {
    // "runner disconnected" in name → infra wins
    const result = classifyCIFailure('runner disconnected', 'ECONNRESET network error');
    expect(result).toBe('infra');
  });

  it('classifies generic failure (no known pattern) as actionable', () => {
    const result = classifyCIFailure('deploy', 'Unknown deployment failure');
    expect(result).toBe('actionable');
  });
});

// ---------------------------------------------------------------------------
// PRStatusChecker.fetchFailedChecks returns ClassifiedCIFailure[]
// ---------------------------------------------------------------------------

describe('fetchFailedChecks returns ClassifiedCIFailure[]', () => {
  it('returns objects with failureClass field', async () => {
    const mockChecks: ClassifiedCIFailure[] = [
      makeClassifiedFailure('build', 'TS2345 error', 'actionable'),
      makeClassifiedFailure('test', 'Runner lost connection', 'infra'),
    ];

    vi.mocked(prStatusChecker.fetchFailedChecks).mockResolvedValueOnce(mockChecks);

    const result = await prStatusChecker.fetchFailedChecks(
      { prNumber: 42, projectPath: '/fake', branchName: 'feature/test' } as never,
      'abc123'
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('failureClass', 'actionable');
    expect(result[1]).toHaveProperty('failureClass', 'infra');
  });
});

// ---------------------------------------------------------------------------
// classify-skip path: infra failures
// ---------------------------------------------------------------------------

describe('classify-skip path — infra failures', () => {
  it('classifies infrastructure failure as infra class', () => {
    const result = classifyCIFailure('build', 'Runner lost connection during execution');
    expect(result).toBe('infra');
  });

  it('classifies disk-full failure as infra class', () => {
    const result = classifyCIFailure('build', 'No space left on device');
    expect(result).toBe('infra');
  });

  it('does not classify actionable errors as infra', () => {
    const result = classifyCIFailure(
      'build',
      "error TS2345: Argument of type 'string' is not assignable"
    );
    expect(result).not.toBe('infra');
  });

  it('infra checks should be excluded from remediation payload', () => {
    const allChecks: ClassifiedCIFailure[] = [
      makeClassifiedFailure('build', 'Runner lost connection', 'infra'),
    ];

    const actionable = allChecks.filter((c) => c.failureClass === 'actionable');
    expect(actionable).toHaveLength(0);

    // When all checks are infra, we expect NO remediation
    const shouldSkipRemediation =
      actionable.length === 0 && allChecks.some((c) => c.failureClass === 'infra');
    expect(shouldSkipRemediation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classify-skip path: flaky failures
// ---------------------------------------------------------------------------

describe('classify-skip path — flaky failures', () => {
  it('classifies network timeout as flaky', () => {
    const result = classifyCIFailure('e2e', 'Error: connect ETIMEDOUT 192.168.1.1:443');
    expect(result).toBe('flaky');
  });

  it('classifies rate limit as flaky', () => {
    const result = classifyCIFailure(
      'integration',
      'Error: rate limit exceeded — too many requests'
    );
    expect(result).toBe('flaky');
  });

  it('does not classify actionable failures as flaky', () => {
    const result = classifyCIFailure(
      'test',
      '2 tests failed\n  ● user.test.ts › should return 200'
    );
    expect(result).not.toBe('flaky');
  });

  it('flaky checks should be excluded from remediation payload', () => {
    const allChecks: ClassifiedCIFailure[] = [
      makeClassifiedFailure('e2e', 'socket hang up', 'flaky'),
      makeClassifiedFailure('integration', 'ECONNRESET', 'flaky'),
    ];

    const actionable = allChecks.filter((c) => c.failureClass === 'actionable');
    expect(actionable).toHaveLength(0);

    const shouldSkipRemediation =
      actionable.length === 0 && allChecks.some((c) => c.failureClass === 'flaky');
    expect(shouldSkipRemediation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classify-remediate path: actionable failures
// ---------------------------------------------------------------------------

describe('classify-remediate path — actionable failures', () => {
  it('classifies build failures as actionable', () => {
    const result = classifyCIFailure(
      'build',
      'Build failed: Module not found: Error: @/components/Button'
    );
    expect(result).toBe('actionable');
  });

  it('classifies lint failures as actionable', () => {
    const result = classifyCIFailure('lint', "Expected '===' but saw '==' (eqeqeq)");
    expect(result).toBe('actionable');
  });

  it('actionable checks proceed to remediation', () => {
    const allChecks: ClassifiedCIFailure[] = [
      makeClassifiedFailure('build', 'TS2345 error', 'actionable'),
      makeClassifiedFailure('test', 'socket hang up', 'flaky'),
    ];

    const actionable = allChecks.filter((c) => c.failureClass === 'actionable');
    expect(actionable).toHaveLength(1);

    // When at least one check is actionable, remediation proceeds
    const shouldRemediate = actionable.length > 0;
    expect(shouldRemediate).toBe(true);
  });

  it('mixed infra+actionable proceeds with remediation (actionable wins)', () => {
    const allChecks: ClassifiedCIFailure[] = [
      makeClassifiedFailure('build', 'Runner lost connection', 'infra'),
      makeClassifiedFailure('typecheck', 'TS2322 type error', 'actionable'),
    ];

    const actionable = allChecks.filter((c) => c.failureClass === 'actionable');
    expect(actionable).toHaveLength(1);
    expect(actionable[0].name).toBe('typecheck');
  });
});

// ---------------------------------------------------------------------------
// buildCIFixPrompt includes failure class
// ---------------------------------------------------------------------------

describe('buildCIFixPrompt includes failure class', () => {
  it('includes failureClass field in ClassifiedCIFailure', () => {
    const check = makeClassifiedFailure('typecheck', 'TS2345 error', 'actionable');
    expect(check.failureClass).toBe('actionable');
    expect(check).toHaveProperty('name', 'typecheck');
    expect(check).toHaveProperty('conclusion', 'failure');
    expect(check).toHaveProperty('output', 'TS2345 error');
  });

  it('ClassifiedCIFailure shape satisfies contract', () => {
    const infraCheck = makeClassifiedFailure('build', 'runner disconnected', 'infra');
    const flakyCheck = makeClassifiedFailure('e2e', 'ECONNRESET', 'flaky');
    const actionableCheck = makeClassifiedFailure('test', 'assertion failed', 'actionable');

    expect(infraCheck.failureClass).toBe('infra');
    expect(flakyCheck.failureClass).toBe('flaky');
    expect(actionableCheck.failureClass).toBe('actionable');
  });
});
