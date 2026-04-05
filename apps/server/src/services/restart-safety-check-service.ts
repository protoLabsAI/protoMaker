/**
 * RestartSafetyCheckService
 *
 * On server restart, determines the safe action for each in-progress feature
 * before auto-resuming it. Prevents duplicate commits, double PR creation,
 * and conflicting git state caused by blindly re-running features.
 *
 * Possible outcomes per feature:
 * - `resume`    — No PR, clean (or absent) worktree. Safe to reset to backlog.
 * - `to_review` — Feature already has an open PR. Move to review status.
 * - `block`     — Worktree has uncommitted changes or merge conflicts.
 *                 Set to blocked with a human-readable reason.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { access } from 'node:fs/promises';
import path from 'path';
import type { Feature } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';

const execFileAsync = promisify(execFile);
const logger = createLogger('RestartSafetyCheck');

export type SafetyCheckAction = 'resume' | 'block' | 'to_review';

export interface SafetyCheckResult {
  action: SafetyCheckAction;
  reason?: string;
}

export class RestartSafetyCheckService {
  /**
   * Determine the correct action for an in-progress feature on server restart.
   */
  async check(feature: Feature, projectPath: string): Promise<SafetyCheckResult> {
    // 1. Feature already has a PR — don't re-run, move to review
    if (feature.prNumber) {
      return {
        action: 'to_review',
        reason: `PR #${feature.prNumber} already exists`,
      };
    }

    // 2. Check worktree state if one exists
    const worktreePath = this.resolveWorktreePath(feature, projectPath);
    if (worktreePath !== null) {
      const worktreeExists = await this.pathExists(worktreePath);
      if (worktreeExists) {
        const { isDirty, hasConflicts } = await this.checkWorktreeState(worktreePath);
        if (hasConflicts) {
          return {
            action: 'block',
            reason: `Worktree has merge conflicts: ${worktreePath}`,
          };
        }
        if (isDirty) {
          return {
            action: 'block',
            reason: `Worktree has uncommitted changes: ${worktreePath}`,
          };
        }
      }
    }

    // 3. Safe to resume normally
    return { action: 'resume' };
  }

  /**
   * Resolve the expected worktree path for a feature.
   * Uses branchName (primary) then featureId (legacy fallback).
   * Returns null if neither is available.
   */
  resolveWorktreePath(feature: Feature, projectPath: string): string | null {
    const worktreesDir = path.join(projectPath, '.worktrees');

    if (feature.branchName) {
      const sanitized = feature.branchName.replace(/[^a-zA-Z0-9_-]/g, '-');
      return path.join(worktreesDir, sanitized);
    }

    if (feature.id) {
      const sanitized = feature.id.replace(/[^a-zA-Z0-9_-]/g, '-');
      return path.join(worktreesDir, sanitized);
    }

    return null;
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await access(p);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run `git status --porcelain` in the worktree to detect dirty or conflicted state.
   * If the command fails (e.g., not a valid git repo), defaults to clean
   * so we don't block a feature that is actually resumable.
   */
  private async checkWorktreeState(
    worktreePath: string
  ): Promise<{ isDirty: boolean; hasConflicts: boolean }> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: worktreePath,
        timeout: 10_000,
      });

      const lines = stdout.split('\n').filter(Boolean);

      // Conflict status codes per `git status --porcelain` documentation:
      // Both-modified (UU), Both-added (AA), Both-deleted (DD),
      // Added-by-us (AU), Updated-by-them (UA), Deleted-by-us (DU), Deleted-by-them (UD)
      const conflictPrefixes = ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'];
      const hasConflicts = lines.some((line) =>
        conflictPrefixes.some((prefix) => line.startsWith(prefix))
      );

      return { isDirty: lines.length > 0, hasConflicts };
    } catch (err) {
      logger.warn(
        `[RestartSafetyCheck] Could not read git status in worktree "${worktreePath}" — assuming clean:`,
        err
      );
      // Default to clean: attempting to resume is safer than permanently blocking
      return { isDirty: false, hasConflicts: false };
    }
  }
}
