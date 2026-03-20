import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildGitAddCommand,
  DEFAULT_STAGING_EXCLUSIONS,
} from '../../../src/lib/git-staging-utils.js';

describe('buildGitAddCommand', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'git-staging-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('default exclusions', () => {
    it('should omit all gitignore-managed dirs from pathspec', () => {
      // All three default exclusions (.automaker/, .worktrees/, .claude/worktrees/)
      // are gitignore-managed — no pathspec exclusions emitted
      expect(buildGitAddCommand(tempDir)).toBe('git add -A -- ');
    });

    it('should include .automaker/memory/ when that directory exists', () => {
      mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });
      expect(buildGitAddCommand(tempDir)).toBe("git add -A -- '.automaker/memory/'");
    });

    it('should include .automaker/skills/ when that directory exists', () => {
      mkdirSync(join(tempDir, '.automaker', 'skills'), { recursive: true });
      expect(buildGitAddCommand(tempDir)).toBe("git add -A -- '.automaker/skills/'");
    });

    it('should include both memory and skills when both directories exist', () => {
      mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });
      mkdirSync(join(tempDir, '.automaker', 'skills'), { recursive: true });
      expect(buildGitAddCommand(tempDir)).toBe(
        "git add -A -- '.automaker/memory/' '.automaker/skills/'"
      );
    });

    it('should not re-include memory/skills when only .automaker/ exists (no subdirs)', () => {
      mkdirSync(join(tempDir, '.automaker'), { recursive: true });
      expect(buildGitAddCommand(tempDir)).toBe('git add -A -- ');
    });
  });

  describe('configurable exclusions', () => {
    it('should omit .automaker/ from pathspec when it is in custom list (gitignore-managed)', () => {
      // .automaker/ is gitignore-managed — no pathspec exclusion is emitted for it
      expect(buildGitAddCommand(tempDir, ['.automaker/'])).toBe('git add -A -- ');
    });

    it('should re-include .automaker/memory/ when .automaker/ is in custom list and dir exists', () => {
      mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });
      expect(buildGitAddCommand(tempDir, ['.automaker/'])).toBe(
        "git add -A -- '.automaker/memory/'"
      );
    });

    it('should not re-include .automaker subdirs when .automaker/ is not in custom list', () => {
      mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });
      mkdirSync(join(tempDir, '.automaker', 'skills'), { recursive: true });
      // .worktrees/ is gitignore-managed too — no pathspec exclusion emitted
      expect(buildGitAddCommand(tempDir, ['.worktrees/'])).toBe('git add -A -- ');
    });

    it('should omit .claude/worktrees/ from pathspec (gitignore-managed)', () => {
      // .claude/worktrees/ is now gitignore-managed — no pathspec exclusion emitted
      expect(buildGitAddCommand(tempDir, ['.claude/worktrees/'])).toBe('git add -A -- ');
    });

    it('should emit pathspec for dirs not in gitignore-managed set', () => {
      expect(buildGitAddCommand(tempDir, ['custom-dir/'])).toBe("git add -A -- ':!custom-dir/'");
    });

    it('should handle empty exclusion list', () => {
      expect(buildGitAddCommand(tempDir, [])).toBe('git add -A -- ');
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
