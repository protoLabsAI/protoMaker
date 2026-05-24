/**
 * Tests for the safe-exec primitive — the replacement for shell-string
 * `exec`/`execSync` that's vulnerable to command injection via branch names,
 * file names, and worktree paths (#3597).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeRef, isSafeRef, safeExec, safeGit, UnsafeRefError } from '../src/safe-exec.js';

describe('isSafeRef / assertSafeRef', () => {
  it('accepts standard branch names', () => {
    for (const ref of [
      'main',
      'dev',
      'feature/add-thing',
      'fix/some-bug-abc1234',
      'refs/heads/main',
      'v1.0.0',
      'release/2026.05',
    ]) {
      expect(isSafeRef(ref)).toBe(true);
      expect(() => assertSafeRef(ref, 'ref')).not.toThrow();
    }
  });

  it('rejects shell metacharacters', () => {
    for (const ref of [
      'main; rm -rf /',
      '$(whoami)',
      '`whoami`',
      'main && curl evil.com',
      'main | tee /tmp/x',
      "main' OR '1'='1",
      'main"',
      'main$bar',
      'main\\nls',
      'a b',
      'main\twith\ttab',
      'main\n',
    ]) {
      expect(isSafeRef(ref)).toBe(false);
      expect(() => assertSafeRef(ref, 'branchName')).toThrow(UnsafeRefError);
    }
  });

  it('rejects empty string', () => {
    expect(isSafeRef('')).toBe(false);
    expect(() => assertSafeRef('', 'ref')).toThrow(UnsafeRefError);
  });

  it('rejects characters outside the conservative allowlist even if git accepts them', () => {
    // Git allows '+' in ref names; our allowlist is intentionally narrower
    // to avoid edge cases when interpolating into paths or commit messages.
    expect(isSafeRef('feature/with+plus')).toBe(false);
    // Git allows '#'? No — but ensure we reject anyway.
    expect(isSafeRef('feature/issue-#42')).toBe(false);
  });

  it('UnsafeRefError carries the field name and value in its message', () => {
    try {
      assertSafeRef('main; rm', 'branchName');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnsafeRefError);
      expect((err as Error).message).toContain('branchName');
      expect((err as Error).message).toContain('main; rm');
    }
  });
});

describe('safeExec', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'safe-exec-test-'));

  it('runs a binary with argv and returns stdout/stderr', async () => {
    const result = await safeExec('node', ['-e', 'process.stdout.write("hello")'], {
      cwd: tmp,
    });
    expect(result.stdout).toBe('hello');
    expect(result.stderr).toBe('');
  });

  it('passes arguments verbatim — shell metacharacters are NOT interpreted', async () => {
    // If this argv were concatenated into a shell string, the `; echo PWNED`
    // would execute as a second command. With execFile + argv, it's just data
    // and node prints it as a single string.
    const payload = 'safe; echo PWNED';
    const result = await safeExec(
      'node',
      ['-e', `process.stdout.write(process.argv[1])`, payload],
      { cwd: tmp }
    );
    expect(result.stdout).toBe(payload);
    expect(result.stdout).not.toContain('PWNED\n');
  });

  it('respects the timeout', async () => {
    await expect(
      safeExec('node', ['-e', 'setTimeout(() => {}, 5000)'], { cwd: tmp, timeout: 100 })
    ).rejects.toThrow();
  });

  it('rejects on non-zero exit code', async () => {
    await expect(safeExec('node', ['-e', 'process.exit(1)'], { cwd: tmp })).rejects.toThrow();
  });

  // Cleanup
  it.afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('safeGit', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'safe-git-test-'));

  it('runs git with argv against a real repo', async () => {
    // Bootstrap a tiny repo so `git rev-parse` has something to say.
    await safeExec('git', ['init', '-q', '-b', 'main'], { cwd: tmp });
    await safeExec('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp });
    await safeExec('git', ['config', 'user.name', 'Test'], { cwd: tmp });
    writeFileSync(join(tmp, 'a'), 'a');
    await safeExec('git', ['add', 'a'], { cwd: tmp });
    await safeExec('git', ['commit', '-q', '-m', 'initial'], { cwd: tmp });

    const { stdout } = await safeGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tmp });
    expect(stdout.trim()).toBe('main');
  });

  it('handles a branch name with characters that would break a shell-string call', async () => {
    // This branch name has a dot and a dash — both safe under our allowlist
    // and historically a problem source when shell-string-interpolated alongside
    // a dynamic adjacent value. safeGit passes it through cleanly.
    await safeExec('git', ['checkout', '-q', '-b', 'feature/x.y-z'], { cwd: tmp });
    const { stdout } = await safeGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tmp });
    expect(stdout.trim()).toBe('feature/x.y-z');
  });

  it.afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
