/**
 * PrePushValidationService Unit Tests — TDD Red Phase
 *
 * Tests for validateBeforePush() covering:
 *   - format check pass / fail / auto-fix
 *   - typecheck pass / fail
 *   - parallel execution
 *   - timeout handling
 *   - configurable check list
 *   - disabled mode
 *   - warn-only mode
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:child_process — must be hoisted before any import that uses it
// ---------------------------------------------------------------------------
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

import { execFile } from 'node:child_process';
import type { PrePushValidation } from '@protolabsai/types';
import { PrePushValidationService } from '@/services/pre-push-validation-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/tmp/test-project';

/** Simulate a successful child_process.execFile call (exit code 0) */
function resolveExecFile(stdout = '', stderr = '') {
  vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
    cb(null, stdout, stderr);
    return {} as ReturnType<typeof execFile>;
  });
}

/** Simulate a failing child_process.execFile call (non-zero exit) */
function rejectExecFile(exitCode: number, stdout = '', stderr = 'error output') {
  vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
    const err = Object.assign(new Error('Command failed'), { code: exitCode });
    cb(err, stdout, stderr);
    return {} as ReturnType<typeof execFile>;
  });
}

/** Simulate a slow execFile that never calls back within the timeout */
function hangExecFile() {
  vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, _cb: any) => {
    // never calls cb — simulates a hung process
    return {} as ReturnType<typeof execFile>;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrePushValidationService', () => {
  let service: PrePushValidationService;

  beforeEach(() => {
    service = new PrePushValidationService();
  });

  // ── Disabled mode ─────────────────────────────────────────────────────────

  describe('disabled mode', () => {
    it('skips all checks and returns success when disabled is true', async () => {
      const config: PrePushValidation = { disabled: true };
      const result = await service.validate(PROJECT_PATH, config);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(vi.mocked(execFile)).not.toHaveBeenCalled();
    });
  });

  // ── Format check ──────────────────────────────────────────────────────────

  describe('format check', () => {
    it('returns success when format check exits with code 0', async () => {
      resolveExecFile('');
      const config: PrePushValidation = { checks: ['format'] };

      const result = await service.validate(PROJECT_PATH, config);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      const formatResult = result.results.find((r) => r.check === 'format');
      expect(formatResult).toBeDefined();
      expect(formatResult!.passed).toBe(true);
    });

    it('returns failure when format check exits with non-zero code and autoFix is false', async () => {
      rejectExecFile(1, '', 'some files need formatting');
      const config: PrePushValidation = { checks: ['format'], autoFix: false };

      const result = await service.validate(PROJECT_PATH, config);

      expect(result.success).toBe(false);
      const formatResult = result.results.find((r) => r.check === 'format');
      expect(formatResult).toBeDefined();
      expect(formatResult!.passed).toBe(false);
      expect(formatResult!.autoFixed).toBeFalsy();
    });

    it('runs prettier auto-fix then re-checks when autoFix is true and format fails', async () => {
      // First call (format check) fails; second call (auto-fix) succeeds;
      // third call (re-check after fix) passes.
      vi.mocked(execFile)
        .mockImplementationOnce((_cmd, _args, _opts, cb: any) => {
          // initial format check — fail
          const err = Object.assign(new Error('Command failed'), { code: 1 });
          cb(err, '', 'needs formatting');
          return {} as ReturnType<typeof execFile>;
        })
        .mockImplementationOnce((_cmd, _args, _opts, cb: any) => {
          // prettier --write auto-fix — success
          cb(null, '', '');
          return {} as ReturnType<typeof execFile>;
        })
        .mockImplementationOnce((_cmd, _args, _opts, cb: any) => {
          // re-check after fix — success
          cb(null, '', '');
          return {} as ReturnType<typeof execFile>;
        });

      const config: PrePushValidation = { checks: ['format'], autoFix: true };
      const result = await service.validate(PROJECT_PATH, config);

      expect(result.success).toBe(true);
      const formatResult = result.results.find((r) => r.check === 'format');
      expect(formatResult).toBeDefined();
      expect(formatResult!.passed).toBe(true);
      expect(formatResult!.autoFixed).toBe(true);
      // auto-fix + re-check means execFile called at least twice beyond the initial check
      expect(vi.mocked(execFile)).toHaveBeenCalledTimes(3);
    });
  });

  // ── Typecheck ─────────────────────────────────────────────────────────────

  describe('typecheck', () => {
    it('returns success when typecheck exits with code 0', async () => {
      resolveExecFile('');
      const config: PrePushValidation = { checks: ['typecheck'] };

      const result = await service.validate(PROJECT_PATH, config);

      expect(result.success).toBe(true);
      const tcResult = result.results.find((r) => r.check === 'typecheck');
      expect(tcResult).toBeDefined();
      expect(tcResult!.passed).toBe(true);
    });

    it('returns failure when typecheck exits with non-zero code', async () => {
      rejectExecFile(2, '', 'TS2345: type error');
      const config: PrePushValidation = { checks: ['typecheck'] };

      const result = await service.validate(PROJECT_PATH, config);

      expect(result.success).toBe(false);
      const tcResult = result.results.find((r) => r.check === 'typecheck');
      expect(tcResult).toBeDefined();
      expect(tcResult!.passed).toBe(false);
    });
  });

  // ── Parallel execution ────────────────────────────────────────────────────

  describe('parallel execution', () => {
    it('runs format and typecheck concurrently when both checks are configured', async () => {
      const callOrder: string[] = [];

      vi.mocked(execFile).mockImplementation((_cmd, args: any, _opts, cb: any) => {
        // Record which check is being invoked
        const arg = Array.isArray(args) ? args.join(' ') : '';
        callOrder.push(arg.includes('typecheck') ? 'typecheck' : 'format');
        cb(null, '', '');
        return {} as ReturnType<typeof execFile>;
      });

      const config: PrePushValidation = { checks: ['format', 'typecheck'] };
      const result = await service.validate(PROJECT_PATH, config);

      // Both checks must have run
      expect(result.results.some((r) => r.check === 'format')).toBe(true);
      expect(result.results.some((r) => r.check === 'typecheck')).toBe(true);
      expect(result.success).toBe(true);
      // Both were dispatched (execFile called twice)
      expect(vi.mocked(execFile)).toHaveBeenCalledTimes(2);
    });
  });

  // ── Timeout handling ──────────────────────────────────────────────────────

  describe('timeout handling', () => {
    it('marks result as timed out and returns failure when checks exceed timeout', async () => {
      hangExecFile();
      // Very short timeout so the test completes quickly
      const config: PrePushValidation = { checks: ['format'], timeout: 50 };

      const result = await service.validate(PROJECT_PATH, config);

      expect(result.timedOut).toBe(true);
      expect(result.success).toBe(false);
    });
  });

  // ── Configurable check list ───────────────────────────────────────────────

  describe('configurable check list', () => {
    it('only runs the checks specified in the checks array', async () => {
      resolveExecFile('');
      const config: PrePushValidation = { checks: ['typecheck'] };

      const result = await service.validate(PROJECT_PATH, config);

      // Should have typecheck result but NOT format result
      expect(result.results.some((r) => r.check === 'typecheck')).toBe(true);
      expect(result.results.some((r) => r.check === 'format')).toBe(false);
      // execFile called exactly once (only typecheck)
      expect(vi.mocked(execFile)).toHaveBeenCalledTimes(1);
    });

    it('runs both format and typecheck when checks is omitted (default)', async () => {
      resolveExecFile('');
      const config: PrePushValidation = {}; // no checks field

      const result = await service.validate(PROJECT_PATH, config);

      expect(result.results.some((r) => r.check === 'format')).toBe(true);
      expect(result.results.some((r) => r.check === 'typecheck')).toBe(true);
    });
  });

  // ── Warn-only mode ────────────────────────────────────────────────────────

  describe('warn-only mode', () => {
    it('returns success even when checks fail in warnOnly mode', async () => {
      rejectExecFile(1, '', 'check failed');
      const config: PrePushValidation = {
        checks: ['format', 'typecheck'],
        warnOnly: true,
      };

      const result = await service.validate(PROJECT_PATH, config);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      // Failed checks should appear as warnings
      expect(result.warnings.length).toBeGreaterThan(0);
      // Individual results still show the checks ran and failed
      expect(result.results.every((r) => r.passed === false)).toBe(true);
    });

    it('populates warnings with failure details in warnOnly mode', async () => {
      rejectExecFile(1, '', 'format issues detected');
      const config: PrePushValidation = { checks: ['format'], warnOnly: true };

      const result = await service.validate(PROJECT_PATH, config);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('format'))).toBe(true);
    });
  });
});
