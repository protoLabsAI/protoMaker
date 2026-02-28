/**
 * Shared git staging utilities.
 *
 * Centralizes the logic for building git add commands that properly handle
 * the .automaker/ directory exclusion/re-inclusion pattern.
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
