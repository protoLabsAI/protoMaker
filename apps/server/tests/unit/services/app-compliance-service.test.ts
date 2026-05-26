/**
 * Unit tests for the app compliance gate (#90).
 *
 *   - opt-out env → skipped, compliant
 *   - missing .gitignore → violation (hard-fail)
 *   - missing branch protection (verified absent) → violation
 *   - undeterminable branch protection (gh error) → NOT a violation
 *   - fully compliant → compliant
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  gitignoreExists: true,
  failRepoView: false,
  ruleTypes: ['required_status_checks'] as string[],
  failRules: false,
}));

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  return {
    ...(actual as object),
    createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: (p: string) =>
      p.endsWith('.gitignore') ? h.gitignoreExists : actual.existsSync(p),
  };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    exec: (
      cmd: string,
      opts: unknown,
      cb?: (err: unknown, res?: { stdout: string; stderr: string }) => void
    ) => {
      const callback = typeof opts === 'function' ? (opts as typeof cb) : cb;
      if (cmd.includes('gh repo view')) {
        if (h.failRepoView) return callback?.(new Error('gh failed'));
        return callback?.(null, {
          stdout: JSON.stringify({
            owner: { login: 'o' },
            name: 'r',
            defaultBranchRef: { name: 'main' },
          }),
          stderr: '',
        });
      }
      if (cmd.includes('rules/branches')) {
        if (h.failRules) return callback?.(new Error('api failed'));
        return callback?.(null, { stdout: JSON.stringify(h.ruleTypes), stderr: '' });
      }
      return callback?.(null, { stdout: '', stderr: '' });
    },
  };
});

import {
  checkAppCompliance,
  buildComplianceRefusalMessage,
  COMPLIANCE_SKIP_ENV,
} from '@/services/app-compliance-service.js';

describe('app compliance gate (#90)', () => {
  beforeEach(() => {
    h.gitignoreExists = true;
    h.failRepoView = false;
    h.ruleTypes = ['required_status_checks'];
    h.failRules = false;
    delete process.env[COMPLIANCE_SKIP_ENV];
  });
  afterEach(() => {
    delete process.env[COMPLIANCE_SKIP_ENV];
  });

  it('skips (and passes) when the opt-out env var is set', async () => {
    process.env[COMPLIANCE_SKIP_ENV] = '1';
    h.gitignoreExists = false; // would otherwise fail
    const r = await checkAppCompliance('/app');
    expect(r.skipped).toBe(true);
    expect(r.compliant).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('passes when .gitignore present and branch protection present', async () => {
    const r = await checkAppCompliance('/app');
    expect(r.compliant).toBe(true);
    expect(r.skipped).toBe(false);
  });

  it('flags a missing .gitignore as a violation', async () => {
    h.gitignoreExists = false;
    const r = await checkAppCompliance('/app');
    expect(r.compliant).toBe(false);
    expect(r.violations.map((v) => v.check)).toContain('gitignore');
  });

  it('flags verified-absent branch protection as a violation', async () => {
    h.ruleTypes = ['pull_request']; // no required_status_checks
    const r = await checkAppCompliance('/app');
    expect(r.compliant).toBe(false);
    expect(r.violations.map((v) => v.check)).toContain('branch-protection');
  });

  it('does NOT flag branch protection when it cannot be determined (gh error)', async () => {
    h.failRules = true; // API error → unverified, not a violation
    const r = await checkAppCompliance('/app');
    expect(r.compliant).toBe(true);
    expect(r.violations.map((v) => v.check)).not.toContain('branch-protection');
  });

  it('refusal message names each violation and the opt-out env var', () => {
    const msg = buildComplianceRefusalMessage('/app', [
      { check: 'gitignore', message: 'no gitignore', remediation: 'add one' },
    ]);
    expect(msg).toContain('/app');
    expect(msg).toContain('no gitignore');
    expect(msg).toContain('add one');
    expect(msg).toContain(COMPLIANCE_SKIP_ENV);
  });
});
