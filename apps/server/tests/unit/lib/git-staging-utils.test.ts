/**
 * Tests for buildGitAddCommand — ensures the git staging command
 * only includes .automaker/memory/ and .automaker/skills/ pathspecs
 * when those directories actually exist.
 *
 * Regression test for: https://github.com/proto-labs-ai/protoMaker/pull/1387
 * Bug: git add fatals with "pathspec did not match any files" when
 * .automaker/memory/ or .automaker/skills/ directories are absent.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildGitAddCommand } from '../../../src/lib/git-staging-utils.js';

describe('buildGitAddCommand', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'git-staging-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return base exclude command when no .automaker dirs exist', () => {
    const cmd = buildGitAddCommand(tempDir);
    expect(cmd).toBe("git add -A -- ':!.automaker/'");
  });

  it('should include .automaker/memory/ when that directory exists', () => {
    mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });

    const cmd = buildGitAddCommand(tempDir);
    expect(cmd).toBe("git add -A -- ':!.automaker/' '.automaker/memory/'");
  });

  it('should include .automaker/skills/ when that directory exists', () => {
    mkdirSync(join(tempDir, '.automaker', 'skills'), { recursive: true });

    const cmd = buildGitAddCommand(tempDir);
    expect(cmd).toBe("git add -A -- ':!.automaker/' '.automaker/skills/'");
  });

  it('should include both when both directories exist', () => {
    mkdirSync(join(tempDir, '.automaker', 'memory'), { recursive: true });
    mkdirSync(join(tempDir, '.automaker', 'skills'), { recursive: true });

    const cmd = buildGitAddCommand(tempDir);
    expect(cmd).toBe(
      "git add -A -- ':!.automaker/' '.automaker/memory/' '.automaker/skills/'"
    );
  });

  it('should not include memory when only .automaker/ exists (no subdirs)', () => {
    mkdirSync(join(tempDir, '.automaker'), { recursive: true });

    const cmd = buildGitAddCommand(tempDir);
    expect(cmd).toBe("git add -A -- ':!.automaker/'");
  });
});
