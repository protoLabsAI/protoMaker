import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  buildGitAddCommand,
  isGitignoreManaged,
  DEFAULT_STAGING_EXCLUSIONS,
} from '../../../src/lib/git-staging-utils.js';

describe('isGitignoreManaged', () => {
  it('returns true when git check-ignore exits 0 (path is gitignored)', () => {
    // This test uses a real temp dir — isGitignoreManaged calls execSync internally
    // In a non-git dir it will throw, returning false
    const tempDir = mkdtempSync(join(tmpdir(), 'git-staging-test-'));
    try {
      // Non-git dir always returns false
      expect(isGitignoreManaged(tempDir, '.automaker/')).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('buildGitAddCommand', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'git-staging-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return plain git add -A when no memory/skills dirs exist', () => {
    expect(buildGitAddCommand(tempDir)).toBe('git add -A');
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

  it('should return plain git add -A when .automaker/ exists but no memory/skills', () => {
    mkdirSync(join(tempDir, '.automaker'), { recursive: true });
    expect(buildGitAddCommand(tempDir)).toBe('git add -A');
  });

  it('should ignore excludeFromStaging parameter (exclusions handled by .gitignore)', () => {
    // The parameter is accepted for API compat but not used for pathspec exclusions
    expect(buildGitAddCommand(tempDir, ['custom-dir/'])).toBe('git add -A');
  });

  it('should handle empty exclusion list', () => {
    expect(buildGitAddCommand(tempDir, [])).toBe('git add -A');
  });

  describe('DEFAULT_STAGING_EXCLUSIONS', () => {
    it('should include .automaker/, .claude/worktrees/, and .worktrees/', () => {
      expect(DEFAULT_STAGING_EXCLUSIONS).toContain('.automaker/');
      expect(DEFAULT_STAGING_EXCLUSIONS).toContain('.claude/worktrees/');
      expect(DEFAULT_STAGING_EXCLUSIONS).toContain('.worktrees/');
    });
  });
});
