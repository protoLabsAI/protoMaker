/**
 * Git Staging Utilities — shared helpers for staging files in worktrees.
 *
 * Centralises the "git add" command so that all call sites
 * (worktree-guard, git-workflow-service, worktree-recovery-service) use
 * the same logic and the behaviour is covered by a single test suite.
 *
 * History: previously used `:!.automaker/` pathspec exclusions, but these
 * conflict with .gitignore when tracked files exist under .automaker/.
 * Now uses plain `git add -A` and relies on .gitignore for exclusion.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Default directories to exclude from `git add`.
 * Kept for API compatibility — callers may reference this list.
 * The actual exclusion is handled by .gitignore, not pathspec.
 */
export const DEFAULT_STAGING_EXCLUSIONS = ['.automaker/', '.claude/worktrees/', '.worktrees/'];

/**
 * Checks whether a given path is already covered by `.gitignore` in the
 * specified working directory. Retained for external callers that may
 * need to check gitignore status independently.
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
 * Builds a git add command that stages all changes.
 *
 * Uses plain `git add -A` — .gitignore handles exclusion of .automaker/,
 * .worktrees/, etc. Pathspec exclusions (`:!dir/`) are intentionally NOT
 * used because they conflict with .gitignore when tracked files exist
 * under the excluded directory (e.g. .automaker/settings.json is tracked,
 * causing `git check-ignore` to return "not ignored", which then causes
 * the `:!.automaker/` pathspec to throw a fatal error).
 *
 * Re-includes .automaker/memory/ and .automaker/skills/ explicitly when
 * those directories exist, since they are git-tracked subdirs under a
 * gitignored parent.
 */
export function buildGitAddCommand(workDir: string, _excludeFromStaging?: string[]): string {
  const pathspecArgs: string[] = [];

  // Re-include .automaker/memory/ and .automaker/skills/ — these are
  // git-tracked agent memory files under a gitignored parent directory.
  if (existsSync(join(workDir, '.automaker/memory'))) {
    pathspecArgs.push("'.automaker/memory/'");
  }
  if (existsSync(join(workDir, '.automaker/skills'))) {
    pathspecArgs.push("'.automaker/skills/'");
  }

  if (pathspecArgs.length === 0) {
    return 'git add -A';
  }

  return `git add -A -- ${pathspecArgs.join(' ')}`;
}

/**
 * Argv-form of {@link buildGitAddCommand} — returns the args to pass after
 * the `git` binary, so callers can use `safeGit(args, opts)` instead of
 * interpolating a shell string. Same logic as the string form, minus the
 * shell-quoting (argv doesn't need it).
 *
 * Use this in any new code path. The string-returning sibling is preserved
 * for the existing 5 call sites pending their own migration.
 */
export function buildGitAddArgs(workDir: string): string[] {
  const args: string[] = ['add', '-A'];
  const pathspecs: string[] = [];

  if (existsSync(join(workDir, '.automaker/memory'))) {
    pathspecs.push('.automaker/memory/');
  }
  if (existsSync(join(workDir, '.automaker/skills'))) {
    pathspecs.push('.automaker/skills/');
  }

  if (pathspecs.length === 0) {
    return args;
  }

  return [...args, '--', ...pathspecs];
}

/**
 * Files that should be gitignored but may have been committed before the
 * .gitignore entry was added, causing them to remain tracked.
 *
 * When a new worktree branch is created, these files are removed from the
 * index via `git rm --cached` so that subsequent commits don't include them.
 */
const TRACKED_BUT_GITIGNORED = ['.automaker-lock'];

/**
 * Unstage files that are tracked by git but should be gitignored.
 *
 * `.automaker-lock` was committed before `.gitignore` was updated. Every
 * agent modifies it, causing `force-with-lease` rejections and rebase
 * conflicts. This function removes such files from the index on worktree
 * init so they no longer participate in git operations.
 *
 * Safe to call repeatedly — if the file is not tracked, `git rm --cached`
 * will fail silently and we swallow the error.
 */
export async function unstageGitignoredFiles(workDir: string): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  for (const file of TRACKED_BUT_GITIGNORED) {
    try {
      // Only unstage if the file is actually tracked in this worktree.
      // `git ls-files --error-unmatch` exits 0 if tracked, 1 if not.
      await execFileAsync('git', ['ls-files', '--error-unmatch', file], {
        cwd: workDir,
      });

      // File is tracked — remove it from the index.
      await execFileAsync('git', ['rm', '--cached', file], {
        cwd: workDir,
      });
    } catch {
      // File not tracked or already unstaged — no-op.
    }
  }
}
