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
 * Directories that are already excluded by `.gitignore`.
 * Using `:!dir/` pathspec exclusions for gitignored directories causes git to
 * error: "The following paths are ignored by one of your .gitignore files: dir"
 * These entries should still appear in `excludeFromStaging` to signal that
 * their subdirectories (e.g. `.automaker/memory/`) may need re-inclusion,
 * but they must NOT be emitted as pathspec arguments.
 */
const GITIGNORE_MANAGED_EXCLUSIONS = new Set(['.automaker/', '.worktrees/', '.claude/worktrees/']);

/**
 * Builds a git add command that stages all changes except the directories in
 * `excludeFromStaging`, then re-includes `.automaker/memory/` and
 * `.automaker/skills/` only if `.automaker/` is excluded and those directories
 * exist in the working tree. This prevents a fatal pathspec error when a
 * directory is absent (e.g. in a fresh worktree).
 *
 * Directories already covered by `.gitignore` are intentionally omitted from
 * the pathspec exclusion list — git would throw an error if a gitignored path
 * appeared in the pathspec (even as a `:!` exclude).
 */
export function buildGitAddCommand(workDir: string, excludeFromStaging?: string[]): string {
  const exclusions = excludeFromStaging ?? DEFAULT_STAGING_EXCLUSIONS;

  // Collect all pathspec arguments into one array, then join at the end.
  // Only emit exclusion pathspecs for dirs NOT already handled by .gitignore:
  // using `:!dir/` for a gitignored path causes:
  //   fatal: The following paths are ignored by one of your .gitignore files: dir
  const pathspecArgs: string[] = exclusions
    .filter((dir) => !GITIGNORE_MANAGED_EXCLUSIONS.has(dir))
    .map((dir) => `':!${dir}'`);

  // Re-include .automaker/memory/ and .automaker/skills/ when .automaker/ is excluded.
  // These subdirs are git-tracked agent memory files that live under a gitignored
  // parent directory and must be staged explicitly.
  if (exclusions.includes('.automaker/')) {
    if (existsSync(join(workDir, '.automaker/memory'))) {
      pathspecArgs.push("'.automaker/memory/'");
    }
    if (existsSync(join(workDir, '.automaker/skills'))) {
      pathspecArgs.push("'.automaker/skills/'");
    }
  }

  return `git add -A -- ${pathspecArgs.join(' ')}`;
}
