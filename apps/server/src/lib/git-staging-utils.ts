/**
 * Git Staging Utilities — shared helpers for staging files in worktrees.
 *
 * Centralises the pathspec-safe "git add" command so that all call sites
 * (worktree-guard, git-workflow-service, worktree-recovery-service) use
 * the same logic and the behaviour is covered by a single test suite.
 */

import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Builds a git add command that stages all changes except .automaker/,
 * then re-includes .automaker/memory/ and .automaker/skills/ only if those
 * directories exist in the working tree. This prevents a fatal pathspec error
 * when a directory is absent (e.g. in a fresh worktree).
 */
export function buildGitAddCommand(workDir: string): string {
  const parts = ["git add -A -- ':!.automaker/'"];
  if (existsSync(join(workDir, '.automaker/memory'))) {
    parts.push("'.automaker/memory/'");
  }
  if (existsSync(join(workDir, '.automaker/skills'))) {
    parts.push("'.automaker/skills/'");
  }
  return parts.join(' ');
}
