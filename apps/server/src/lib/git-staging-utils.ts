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
 * Default directories to exclude from `git add`.
 * Prevents worktree `.git` files and internal automaker directories from
 * being staged as broken submodules (causing CI failures on Cloudflare Pages etc.)
 */
export const DEFAULT_STAGING_EXCLUSIONS = ['.automaker/', '.claude/worktrees/', '.worktrees/'];

/**
 * Builds a git add command that stages all changes except the directories in
 * `excludeFromStaging`, then re-includes `.automaker/memory/` and
 * `.automaker/skills/` only if `.automaker/` is excluded and those directories
 * exist in the working tree. This prevents a fatal pathspec error when a
 * directory is absent (e.g. in a fresh worktree).
 */
export function buildGitAddCommand(workDir: string, excludeFromStaging?: string[]): string {
  const exclusions = excludeFromStaging ?? DEFAULT_STAGING_EXCLUSIONS;
  const exclusionPathspecs = exclusions.map((dir) => `':!${dir}'`).join(' ');
  const parts = [`git add -A -- ${exclusionPathspecs}`];

  // Re-include .automaker/memory/ and .automaker/skills/ when .automaker/ is excluded
  if (exclusions.includes('.automaker/')) {
    if (existsSync(join(workDir, '.automaker/memory'))) {
      parts.push("'.automaker/memory/'");
    }
    if (existsSync(join(workDir, '.automaker/skills'))) {
      parts.push("'.automaker/skills/'");
    }
  }

  return parts.join(' ');
}
