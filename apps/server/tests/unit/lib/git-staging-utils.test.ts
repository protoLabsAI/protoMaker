import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock child_process before importing the module under test.
// execSync exit-code-0 → gitignore-managed (returns undefined, no throw)
// execSync non-zero    → NOT gitignore-managed (throws)
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
import {
  buildGitAddCommand,
  isGitignoreManaged,
  DEFAULT_STAGING_EXCLUSIONS,
} from '../../../src/lib/git-staging-utils.js';

const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;

/** Helper: make execSync succeed (exit 0) for the given paths, throw for all others. */
function mockGitignored(...ignoredPaths: string[]) {
  mockExecSync.mockImplementation((_cmd: string, opts: { cwd?: string }) => {
    const cmd = _cmd as string;
    const isIgnored = ignoredPaths.some((p) => cmd.includes(p));
    if (!isIgnored) {
      const err = new Error('not ignored') as NodeJS.ErrnoException;
      (err as unknown as { status: number }).status = 1;
      throw err;
    }
    // exit 0 — return undefined (no throw)
  });
}

describe('isGitignoreManaged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when git check-ignore exits 0 (path is gitignored)', () => {
    mockExecSync.mockReturnValue(undefined);
    expect(isGitignoreManaged('/some/dir', '.automaker/')).toBe(true);
  });

  it('returns false when git check-ignore throws (path is not gitignored)', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not ignored');
    });
    expect(isGitignoreManaged('/some/dir', 'custom-dir/')).toBe(false);
  });

  it('returns false when not in a git repo (git exits with error)', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repository');
    });
    expect(isGitignoreManaged('/tmp/not-a-repo', '.automaker/')).toBe(false);
  });
});

describe('buildGitAddCommand', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'git-staging-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('default exclusions', () => {
    it('should omit all gitignore-managed dirs from pathspec', () => {
      // All three default exclusions are gitignore-managed
      mockGitignored('.automaker/', '.claude/worktrees/', '.worktrees/');
      expect(buildGitAddCommand(tempDir)).toBe('git add -A');
    });

    it('should include .automaker/memory/ when that directory exists', () => {
      mockGitignored('.automaker/', '.claude/worktrees/', '.worktrees/');
      mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });
      expect(buildGitAddCommand(tempDir)).toBe("git add -A -- '.automaker/memory/'");
    });

    it('should include .automaker/skills/ when that directory exists', () => {
      mockGitignored('.automaker/', '.claude/worktrees/', '.worktrees/');
      mkdirSync(join(tempDir, '.automaker', 'skills'), { recursive: true });
      expect(buildGitAddCommand(tempDir)).toBe("git add -A -- '.automaker/skills/'");
    });

    it('should include both memory and skills when both directories exist', () => {
      mockGitignored('.automaker/', '.claude/worktrees/', '.worktrees/');
      mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });
      mkdirSync(join(tempDir, '.automaker', 'skills'), { recursive: true });
      expect(buildGitAddCommand(tempDir)).toBe(
        "git add -A -- '.automaker/memory/' '.automaker/skills/'"
      );
    });

    it('should not re-include memory/skills when only .automaker/ exists (no subdirs)', () => {
      mockGitignored('.automaker/', '.claude/worktrees/', '.worktrees/');
      mkdirSync(join(tempDir, '.automaker'), { recursive: true });
      expect(buildGitAddCommand(tempDir)).toBe('git add -A');
    });

    it('should emit pathspec exclusion for .claude/worktrees/ when NOT in gitignore', () => {
      // Only .automaker/ and .worktrees/ are gitignored; .claude/worktrees/ is not
      mockGitignored('.automaker/', '.worktrees/');
      // .claude/worktrees/ doesn't exist in tempDir, so it's skipped (existsSync check)
      mkdirSync(join(tempDir, '.claude', 'worktrees'), { recursive: true });
      expect(buildGitAddCommand(tempDir)).toBe("git add -A -- ':!.claude/worktrees/'");
    });
  });

  describe('configurable exclusions', () => {
    it('should omit .automaker/ from pathspec when it is gitignore-managed', () => {
      mockGitignored('.automaker/');
      expect(buildGitAddCommand(tempDir, ['.automaker/'])).toBe('git add -A');
    });

    it('should re-include .automaker/memory/ when .automaker/ is gitignore-managed and dir exists', () => {
      mockGitignored('.automaker/');
      mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });
      expect(buildGitAddCommand(tempDir, ['.automaker/'])).toBe(
        "git add -A -- '.automaker/memory/'"
      );
    });

    it('should not re-include .automaker subdirs when .automaker/ is not in exclusion list', () => {
      mockGitignored('.worktrees/');
      mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });
      mkdirSync(join(tempDir, '.automaker', 'skills'), { recursive: true });
      // .worktrees/ is gitignore-managed — no pathspec exclusion emitted
      expect(buildGitAddCommand(tempDir, ['.worktrees/'])).toBe('git add -A');
    });

    it('should omit .claude/worktrees/ from pathspec when it is gitignore-managed', () => {
      mockGitignored('.claude/worktrees/');
      expect(buildGitAddCommand(tempDir, ['.claude/worktrees/'])).toBe('git add -A');
    });

    it('should emit pathspec for dirs not in gitignore', () => {
      // custom-dir/ is not gitignored — execSync throws
      mockGitignored(); // nothing gitignored
      mkdirSync(join(tempDir, 'custom-dir'), { recursive: true });
      expect(buildGitAddCommand(tempDir, ['custom-dir/'])).toBe("git add -A -- ':!custom-dir/'");
    });

    it('should handle empty exclusion list', () => {
      expect(buildGitAddCommand(tempDir, [])).toBe('git add -A');
    });
  });

  describe('DEFAULT_STAGING_EXCLUSIONS', () => {
    it('should include .automaker/, .claude/worktrees/, and .worktrees/', () => {
      expect(DEFAULT_STAGING_EXCLUSIONS).toContain('.automaker/');
      expect(DEFAULT_STAGING_EXCLUSIONS).toContain('.claude/worktrees/');
      expect(DEFAULT_STAGING_EXCLUSIONS).toContain('.worktrees/');
    });
  });
});
