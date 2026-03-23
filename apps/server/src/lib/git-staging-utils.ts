/**
 * Git Staging Utilities — shared helpers for staging files in worktrees.
 *
 * Centralises the pathspec-safe "git add" command so that all call sites
 * (worktree-guard, git-workflow-service, worktree-recovery-service) use
 * the same logic and the behaviour is covered by a single test suite.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Default directories to exclude from `git add`.
 * Prevents worktree `.git` files and internal automaker directories from
 * being staged as broken submodules (causing CI failures on Cloudflare Pages etc.)
 */
export const DEFAULT_STAGING_EXCLUSIONS = ['.automaker/', '.claude/worktrees/', '.worktrees/'];

/**
 * Checks whether a given path is already covered by `.gitignore` in the
 * specified working directory. Uses `git check-ignore -q <path>` which exits
 * with code 0 when the path is ignored, 1 when it is not, and >1 on error
 * (e.g. not a git repo).
 *
 * Returns `true` (gitignore-managed) only on a clean exit-code-0 result.
 * Any error (non-git dir, git not available, etc.) returns `false` so the
 * caller falls back to emitting an explicit pathspec exclusion — the safe
 * default.
 */
export function isGitignoreManaged(workDir: string, path: string): boolean {
  try {
    execSync(`git check-ignore -q ${path}`, { cwd: workDir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a git add command that stages all changes except the directories in
 * `excludeFromStaging`, then re-includes `.automaker/memory/` and
 * `.automaker/skills/` only if `.automaker/` is excluded and those directories
 * exist in the working tree. This prevents a fatal pathspec error when a
 * directory is absent (e.g. in a fresh worktree).
 *
 * Directories already covered by `.gitignore` are dynamically detected via
 * `git check-ignore` and intentionally omitted from the pathspec exclusion
 * list — git would throw an error if a gitignored path appeared in the
 * pathspec (even as a `:!` exclude).
 */
export function buildGitAddCommand(workDir: string, excludeFromStaging?: string[]): string {
  const exclusions = excludeFromStaging ?? DEFAULT_STAGING_EXCLUSIONS;

  // Collect all pathspec arguments into one array, then join at the end.
  // Only emit exclusion pathspecs for dirs NOT already handled by .gitignore:
  // using `:!dir/` for a gitignored path causes:
  //   fatal: The following paths are ignored by one of your .gitignore files: dir
  const pathspecArgs: string[] = exclusions
    .filter((dir) => !isGitignoreManaged(workDir, dir))
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
