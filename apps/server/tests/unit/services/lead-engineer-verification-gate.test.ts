/**
 * Unit tests for the EXECUTE-exit verifier-evidence gate (beads zg4).
 *
 * Verifies runVerificationGate: disabled → skip; enabled + command passes →
 * 'pass' with evidence recorded; enabled + command fails → 'fail' with evidence;
 * unresolvable worktree / no branch → skip. The processor's exit hook turns a
 * 'fail' into a blocked transition (covered by the decision here).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { mockExec } = vi.hoisted(() => ({ mockExec: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, exec: mockExec };
});

const { mockGetWorkflowSettings } = vi.hoisted(() => ({ mockGetWorkflowSettings: vi.fn() }));
vi.mock('@/lib/settings-helpers.js', () => ({
  getWorkflowSettings: mockGetWorkflowSettings,
  getEffectivePrBaseBranch: vi.fn().mockResolvedValue('main'),
}));

import { ExecuteProcessor } from '@/services/lead-engineer-execute-processor.js';
import type { ProcessorServiceContext, StateContext } from '@/services/lead-engineer-types.js';

function makeCtx(overrides: Record<string, unknown> = {}): StateContext {
  return {
    feature: { id: 'feat-1', title: 'F', branchName: 'feature/x', ...overrides },
    projectPath: '/proj',
  } as unknown as StateContext;
}

function makeProc(settings: unknown, worktree: string | null = '/wt') {
  const update = vi.fn().mockResolvedValue(undefined);
  const svc = {
    featureLoader: { update, get: vi.fn() },
    settingsService: {},
    events: { emit: vi.fn() },
  } as unknown as ProcessorServiceContext;
  mockGetWorkflowSettings.mockResolvedValue(settings);
  const proc = new ExecuteProcessor(svc);
  // resolveWorktreeDir is a private git helper — stub it for the unit.
  (proc as unknown as { resolveWorktreeDir: unknown }).resolveWorktreeDir = vi
    .fn()
    .mockResolvedValue(worktree);
  return { proc, update };
}

const passExec = (
  _c: string,
  _o: unknown,
  cb: (e: null, r: { stdout: string; stderr: string }) => void
) => cb(null, { stdout: '', stderr: '' });
const failExec = (
  _c: string,
  _o: unknown,
  cb: (e: Error & { stdout?: string; stderr?: string }) => void
) => {
  const err = new Error('tsc failed') as Error & { stdout?: string; stderr?: string };
  err.stdout = 'src/x.ts(1,1): error TS2322';
  cb(err);
};

describe('ExecuteProcessor.runVerificationGate (zg4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips (no run, no evidence) when disabled', async () => {
    const { proc, update } = makeProc({ requireVerificationEvidence: { enabled: false } });
    const result = await (proc as any).runVerificationGate(makeCtx());
    expect(result).toBe('skipped');
    expect(mockExec).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 'pass' and records passing evidence when the command succeeds", async () => {
    mockExec.mockImplementation(passExec);
    const { proc, update } = makeProc({
      requireVerificationEvidence: { enabled: true, command: 'npm run typecheck' },
    });
    const result = await (proc as any).runVerificationGate(makeCtx());
    expect(result).toBe('pass');
    expect(update).toHaveBeenCalledWith(
      '/proj',
      'feat-1',
      expect.objectContaining({
        verificationEvidence: expect.objectContaining({
          command: 'npm run typecheck',
          passed: true,
        }),
      })
    );
  });

  it("returns 'fail' and records failing evidence (with output) when the command fails", async () => {
    mockExec.mockImplementation(failExec);
    const { proc, update } = makeProc({ requireVerificationEvidence: { enabled: true } });
    const result = await (proc as any).runVerificationGate(makeCtx());
    expect(result).toBe('fail');
    const evidence = update.mock.calls[0][2].verificationEvidence;
    expect(evidence.passed).toBe(false);
    expect(evidence.output).toContain('error TS2322');
  });

  it('skips when the feature has no branch', async () => {
    const { proc } = makeProc({ requireVerificationEvidence: { enabled: true } });
    const result = await (proc as any).runVerificationGate(makeCtx({ branchName: undefined }));
    expect(result).toBe('skipped');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('skips when the worktree cannot be resolved', async () => {
    mockExec.mockImplementation(passExec);
    const { proc } = makeProc({ requireVerificationEvidence: { enabled: true } }, null);
    const result = await (proc as any).runVerificationGate(makeCtx());
    expect(result).toBe('skipped');
  });
});
