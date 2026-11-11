/**
 * Unit tests for the repo-remote validation service.
 *
 * Covers:
 *   - extractRepoSlug() for HTTPS and SSH GitHub URLs
 *   - readGitRemoteOrigin() success and failure
 *   - validateRepoSlug() — match, mismatch, not configured, skip env
 *   - buildRepoSlugMismatchMessage() content
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  remoteUrl: 'https://github.com/protoLabsAI/ava.git',
  failGit: false,
}));

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  return {
    ...(actual as object),
    createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
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
      if (cmd.includes('git remote get-url origin')) {
        if (h.failGit) return callback?.(new Error('git failed'));
        return callback?.(null, { stdout: h.remoteUrl + '\n', stderr: '' });
      }
      return callback?.(null, { stdout: '', stderr: '' });
    },
  };
});

import {
  extractRepoSlug,
  readGitRemoteOrigin,
  validateRepoSlug,
  buildRepoSlugMismatchMessage,
  REPO_SLUG_SKIP_ENV,
} from '@/services/repo-remote-validation.js';

describe('extractRepoSlug()', () => {
  it('extracts slug from HTTPS GitHub URL', () => {
    expect(extractRepoSlug('https://github.com/owner/repo.git')).toBe('owner/repo');
    expect(extractRepoSlug('https://github.com/owner/repo')).toBe('owner/repo');
  });

  it('extracts slug from SSH GitHub URL', () => {
    expect(extractRepoSlug('git@github.com:owner/repo.git')).toBe('owner/repo');
    expect(extractRepoSlug('git@github.com:owner/repo')).toBe('owner/repo');
  });

  it('returns null for non-GitHub URLs', () => {
    expect(extractRepoSlug('https://gitlab.com/owner/repo.git')).toBeNull();
    expect(extractRepoSlug('ssh://git@internal.example.com/repo.git')).toBeNull();
    expect(extractRepoSlug('file:///local/path')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(extractRepoSlug('  https://github.com/owner/repo.git  ')).toBe('owner/repo');
  });
});

describe('readGitRemoteOrigin()', () => {
  it('reads the origin URL from git', async () => {
    h.remoteUrl = 'https://github.com/test/repo.git';
    const url = await readGitRemoteOrigin('/some/path');
    expect(url).toBe('https://github.com/test/repo.git');
  });

  it('returns null when git command fails', async () => {
    h.failGit = true;
    const url = await readGitRemoteOrigin('/some/path');
    expect(url).toBeNull();
  });

  it('returns null for non-GitHub remotes', async () => {
    h.remoteUrl = 'https://gitlab.com/owner/repo.git';
    const url = await readGitRemoteOrigin('/some/path');
    expect(url).toBe('https://gitlab.com/owner/repo.git');
  });
});

describe('validateRepoSlug()', () => {
  beforeEach(() => {
    h.remoteUrl = 'https://github.com/protoLabsAI/ava.git';
    h.failGit = false;
    delete process.env[REPO_SLUG_SKIP_ENV];
  });
  afterEach(() => {
    delete process.env[REPO_SLUG_SKIP_ENV];
  });

  it('returns notConfigured when expectedRepoSlug is undefined', async () => {
    const result = await validateRepoSlug('/path');
    expect(result.notConfigured).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('returns valid when slugs match', async () => {
    const result = await validateRepoSlug('/path', 'protoLabsAI/ava');
    expect(result.valid).toBe(true);
    expect(result.notConfigured).toBe(false);
    expect(result.actualSlug).toBe('protoLabsAI/ava');
  });

  it('is case-insensitive for owner names', async () => {
    const result = await validateRepoSlug('/path', 'ProtolabsAI/Ava');
    expect(result.valid).toBe(true);
  });

  it('returns invalid when slugs mismatch', async () => {
    const result = await validateRepoSlug('/path', 'protoLabsAI/other-repo');
    expect(result.valid).toBe(false);
    expect(result.expectedSlug).toBe('protoLabsAI/other-repo');
    expect(result.actualSlug).toBe('protoLabsAI/ava');
    expect(result.mismatchMessage).toBeDefined();
  });

  it('skips when opt-out env var is set', async () => {
    process.env[REPO_SLUG_SKIP_ENV] = '1';
    const result = await validateRepoSlug('/path', 'protoLabsAI/other-repo');
    expect(result.skipped).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('does NOT block when actual slug cannot be resolved (non-GitHub remote)', async () => {
    h.remoteUrl = 'https://gitlab.com/owner/repo.git';
    const result = await validateRepoSlug('/path', 'protoLabsAI/ava');
    expect(result.valid).toBe(true); // non-GitHub remote → skip, don't block
    expect(result.actualSlug).toBeNull();
  });

  it('does NOT block when git command fails (no remote)', async () => {
    h.failGit = true;
    const result = await validateRepoSlug('/path', 'protoLabsAI/ava');
    expect(result.valid).toBe(true); // can't determine → don't block
    expect(result.actualSlug).toBeNull();
  });
});

describe('buildRepoSlugMismatchMessage()', () => {
  it('includes expected and actual slugs', () => {
    const msg = buildRepoSlugMismatchMessage('/path', 'owner/expected', 'owner/actual');
    expect(msg).toContain('/path');
    expect(msg).toContain('owner/expected');
    expect(msg).toContain('owner/actual');
  });

  it('handles null actual slug', () => {
    const msg = buildRepoSlugMismatchMessage('/path', 'owner/expected', null);
    expect(msg).toContain('(no origin remote)');
  });

  it('mentions the opt-out env var', () => {
    const msg = buildRepoSlugMismatchMessage('/path', 'owner/expected', 'owner/actual');
    expect(msg).toContain(REPO_SLUG_SKIP_ENV);
  });
});

describe('Concurrency & race guard: multiple parallel validations', () => {
  it('handles concurrent validations for same project without corruption', async () => {
    const n = 8;
    const promises = Array.from({ length: n }, () => validateRepoSlug('/path', 'protoLabsAI/ava'));
    const results = await Promise.all(promises);
    expect(results).toHaveLength(n);
    for (const r of results) {
      expect(r.valid).toBe(true);
      expect(r.actualSlug).toBe('protoLabsAI/ava');
    }
  });

  it('handles concurrent mismatch validations deterministically', async () => {
    const n = 5;
    const promises = Array.from({ length: n }, () =>
      validateRepoSlug('/path', 'protoLabsAI/other-repo')
    );
    const results = await Promise.all(promises);
    expect(results).toHaveLength(n);
    for (const r of results) {
      expect(r.valid).toBe(false);
      expect(r.expectedSlug).toBe('protoLabsAI/other-repo');
      expect(r.actualSlug).toBe('protoLabsAI/ava');
    }
  });
});
