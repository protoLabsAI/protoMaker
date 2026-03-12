/**
 * Worktree Recovery Service - Post-agent uncommitted work detection and recovery
 *
 * After every agent exits, scans the worktree for uncommitted changes and
 * attempts auto-recovery: format → stage → commit → push → PR creation.
 * Returns structured results; callers are responsible for status updates and events.
 */

import { exec, execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import { DEFAULT_GIT_WORKFLOW_SETTINGS } from '@protolabsai/types';
import { buildGitAddCommand } from '../lib/git-staging-utils.js';
import { createGitExecEnv } from '@protolabsai/git-utils';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const logger = createLogger('WorktreeRecovery');

const execEnv = createGitExecEnv();

export interface WorktreeRecoveryResult {
  /** Whether any uncommitted changes were detected */
  detected: boolean;
  /** Whether recovery succeeded (commit + push + PR) */
  recovered: boolean;
  /** PR URL if one was created */
  prUrl?: string;
  /** PR number if one was created */
  prNumber?: number;
  /** PR creation timestamp */
  prCreatedAt?: string;
  /** Error message if recovery failed */
  error?: string;
}

/**
 * Check for uncommitted work in a worktree after agent exit and recover if found.
 *
 * Steps when uncommitted work is detected:
 * 1. Format changed files with prettier (non-fatal)
 * 2. Stage changed files (excluding .automaker/ except memory/)
 * 3. Commit with HUSKY=0 / --no-verify to bypass hooks
 * 4. Push to remote with -u
 * 5. Create PR via gh CLI targeting prBaseBranch
 *
 * Returns a structured result. The caller is responsible for updating feature
 * status, emitting events, and deciding how to proceed.
 *
 * @param feature - The feature being processed
 * @param worktreePath - Absolute path to the worktree
 * @param projectPath - Absolute path to the main project root (for resolving prettier binary)
 * @param prBaseBranch - Base branch for PR creation and rebase (from settings, defaults to DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch)
 */
export async function checkAndRecoverUncommittedWork(
  feature: Feature,
  worktreePath: string,
  projectPath: string,
  prBaseBranch?: string
): Promise<WorktreeRecoveryResult> {
  const rawBranch = prBaseBranch || DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch;
  // Sanitize branch name to prevent shell injection — allow only valid git ref characters
  const baseBranch = rawBranch.replace(/[^a-zA-Z0-9_./-]/g, '');
  const result: WorktreeRecoveryResult = { detected: false, recovered: false };

  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync('git status --short', {
      cwd: worktreePath,
      env: execEnv,
    });

    if (!statusOutput.trim()) {
      // Worktree is clean — nothing to do
      return result;
    }

    result.detected = true;

    const branchName = feature.branchName;
    if (!branchName) {
      result.error = `uncommitted work in worktree at ${worktreePath} but no branchName set on feature`;
      logger.warn(`[PostAgentHook] ${result.error}`);
      return result;
    }

    logger.warn(
      `[PostAgentHook] Uncommitted work detected in ${worktreePath} for feature ${feature.id} — attempting recovery`
    );
    logger.debug(`[PostAgentHook] Uncommitted changes:\n${statusOutput}`);

    // Step 1: Format changed files with prettier (non-fatal)
    // Use the main repo's prettier binary — worktrees have no node_modules/
    try {
      const { stdout: diffOutput } = await execAsync(
        "git diff HEAD --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.css' '*.md'",
        { cwd: worktreePath, env: execEnv }
      );
      const files = diffOutput.trim().split('\n').filter(Boolean);
      if (files.length > 0) {
        const prettierBin = path.join(projectPath, 'node_modules/.bin/prettier');
        await execAsync(
          `node "${prettierBin}" --ignore-path /dev/null --write ${files.map((f) => `"${f}"`).join(' ')}`,
          { cwd: worktreePath, env: execEnv }
        );
      }
    } catch {
      // Non-fatal: formatting failure should not block recovery
    }

    // Step 2: Stage changed files (exclude .automaker/ except memory/ and skills/ if they exist).
    const addCommand = buildGitAddCommand(worktreePath);
    logger.debug(`[PostAgentHook] Running: ${addCommand}`);
    await execAsync(addCommand, {
      cwd: worktreePath,
      env: execEnv,
    });

    // Verify files were actually staged. If not, fall back to plain `git add .`
    // (worktrees are isolated, so staging everything is safe).
    const { stdout: stagedCheck } = await execAsync('git diff --cached --name-only', {
      cwd: worktreePath,
      env: execEnv,
    });
    if (!stagedCheck.trim()) {
      logger.warn(
        `[PostAgentHook] Pathspec-based git add staged nothing — falling back to 'git add .'`
      );
      await execAsync('git add .', { cwd: worktreePath, env: execEnv });

      // Check again
      const { stdout: retryCheck } = await execAsync('git diff --cached --name-only', {
        cwd: worktreePath,
        env: execEnv,
      });
      if (!retryCheck.trim()) {
        result.error = `git add staged nothing even after fallback — files may be unchanged`;
        logger.error(`[PostAgentHook] ${result.error}`);
        return result;
      }
      logger.info(`[PostAgentHook] Fallback 'git add .' staged files successfully`);
    }

    // Step 3: Commit with HUSKY=0 / --no-verify to bypass hooks
    const commitTitle = (feature.title || 'feature implementation')
      .replace(/"/g, "'")
      .substring(0, 72);
    const commitMessage = `refactor: ${commitTitle}`;

    try {
      await execFileAsync('git', ['commit', '--no-verify', '-m', commitMessage], {
        cwd: worktreePath,
        env: { ...execEnv, HUSKY: '0' },
      });
    } catch (commitError: unknown) {
      // Log the actual git stderr for debugging
      const stderr =
        commitError && typeof commitError === 'object' && 'stderr' in commitError
          ? String((commitError as { stderr: unknown }).stderr)
          : '';
      if (stderr) {
        logger.error(`[PostAgentHook] git commit stderr: ${stderr.trim()}`);
      }
      throw commitError;
    }

    logger.info(`[PostAgentHook] Committed uncommitted work for feature ${feature.id}`);

    // Step 3.5: Rebase onto origin/dev before push to prevent CONFLICTING PRs
    let useForceWithLease = false;
    try {
      await execAsync(`git fetch origin ${baseBranch}`, {
        cwd: worktreePath,
        env: execEnv,
        timeout: 30_000,
      });
      await execAsync(`git rebase origin/${baseBranch}`, {
        cwd: worktreePath,
        env: execEnv,
        timeout: 60_000,
      });
      useForceWithLease = true;
    } catch (rebaseError) {
      const msg = rebaseError instanceof Error ? rebaseError.message : String(rebaseError);
      if (msg.includes('conflict') || msg.includes('CONFLICT')) {
        try {
          await execAsync('git rebase --abort', { cwd: worktreePath, env: execEnv });
        } catch {
          // Best-effort abort
        }
        logger.warn(`[PostAgentHook] Rebase conflicts for ${feature.id}, pushing without rebase`);
      } else {
        logger.warn(`[PostAgentHook] Rebase failed for ${feature.id}: ${msg}`);
        try {
          await execAsync('git rebase --abort', { cwd: worktreePath, env: execEnv });
        } catch {
          // Best-effort abort — may not be in rebase state
        }
      }
    }

    // Step 4: Push to remote with -u
    const forceFlag = useForceWithLease ? ' --force-with-lease' : '';
    await execAsync(`git push${forceFlag} -u origin "${branchName}"`, {
      cwd: worktreePath,
      env: execEnv,
    });

    logger.info(`[PostAgentHook] Pushed branch ${branchName} for feature ${feature.id}`);

    // Step 5: Create PR via gh CLI targeting main
    const prTitle = (feature.title || commitTitle).replace(/"/g, "'");
    const summary = feature.description.substring(0, 500);
    const ellipsis = feature.description.length > 500 ? '...' : '';
    const prBody =
      `## Summary\n\n${summary}${ellipsis}\n\n---\n*Recovered automatically by Automaker post-agent hook*`.replace(
        /"/g,
        "'"
      );

    const { stdout: prOutput } = await execFileAsync(
      'gh',
      [
        'pr',
        'create',
        '--base',
        baseBranch,
        '--head',
        branchName,
        '--title',
        prTitle,
        '--body',
        prBody,
      ],
      { cwd: worktreePath, env: execEnv }
    );

    // Parse PR URL and number from output (gh pr create prints the URL on stdout)
    const prUrl = prOutput.trim();
    const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

    result.prUrl = prUrl;
    result.prNumber = prNumber;
    result.prCreatedAt = new Date().toISOString();
    result.recovered = true;

    // Enable auto-merge so PRs don't sit BLOCKED waiting for manual intervention
    if (prNumber) {
      try {
        await execFileAsync('gh', ['pr', 'merge', String(prNumber), '--auto', '--squash'], {
          cwd: worktreePath,
          env: execEnv,
        });
        logger.info(`[PostAgentHook] Auto-merge enabled on PR #${prNumber}`);
      } catch (autoMergeError) {
        logger.warn(
          `[PostAgentHook] Failed to enable auto-merge on PR #${prNumber}:`,
          autoMergeError
        );
      }
    }

    logger.info(
      `[PostAgentHook] Recovery successful for feature ${feature.id}: PR created at ${prUrl}`
    );

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr: unknown }).stderr).trim()
        : '';
    const fullError = stderr ? `${errorMessage} | stderr: ${stderr}` : errorMessage;
    result.error = `git workflow failed — uncommitted work in worktree at ${worktreePath}: ${fullError}`;
    logger.error(`[PostAgentHook] Recovery failed for feature ${feature.id}: ${fullError}`);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Nested worktree recovery
// ---------------------------------------------------------------------------

export interface NestedWorktreeRecoveryResult {
  /** Whether any .claude/worktrees/agent-* directories were discovered */
  found: boolean;
  /** Absolute paths of nested worktrees that had uncommitted changes */
  worktreesWithChanges: string[];
  /** Relative paths of files that were copied back to the main worktree */
  copiedFiles: string[];
  /** Non-fatal errors encountered during scan/copy */
  errors: string[];
}

/**
 * Scan for nested Claude agent worktrees inside a main worktree and copy any
 * uncommitted work back to the main worktree so the normal recovery flow can
 * commit and push it.
 *
 * The Claude Agent SDK creates worktrees at `.claude/worktrees/agent-{id}/`
 * inside whatever worktree it is spawned from.  If such an agent completes
 * work but fails to commit, those changes are invisible to the main worktree's
 * git status — this helper bridges that gap.
 *
 * Steps:
 * 1. Look for `.claude/worktrees/agent-{id}/` directories inside mainWorktreePath
 * 2. Run `git status --short` on each
 * 3. Copy every modified/added file back to mainWorktreePath (preserving relative path)
 * 4. Clean up the nested worktree directory after copying
 *
 * @param mainWorktreePath - Absolute path to the main (outer) worktree
 */
export async function recoverNestedWorktreeWork(
  mainWorktreePath: string
): Promise<NestedWorktreeRecoveryResult> {
  const result: NestedWorktreeRecoveryResult = {
    found: false,
    worktreesWithChanges: [],
    copiedFiles: [],
    errors: [],
  };

  try {
    const claudeWorktreesDir = path.join(mainWorktreePath, '.claude', 'worktrees');

    // Fast-path: directory doesn't exist — no nested worktrees ever created
    try {
      await fs.access(claudeWorktreesDir);
    } catch {
      return result;
    }

    const entries = await fs.readdir(claudeWorktreesDir, { withFileTypes: true });
    const agentDirs = entries
      .filter((e) => e.isDirectory() && e.name.startsWith('agent-'))
      .map((e) => path.join(claudeWorktreesDir, e.name));

    if (agentDirs.length === 0) {
      return result;
    }

    result.found = true;
    logger.info(`[WorktreeRecovery] Found ${agentDirs.length} nested agent worktree(s) to scan`);

    for (const nestedWorktreePath of agentDirs) {
      try {
        const { stdout: statusOutput } = await execAsync('git status --short', {
          cwd: nestedWorktreePath,
          env: execEnv,
        });

        if (!statusOutput.trim()) {
          logger.info(
            `[WorktreeRecovery] Nested worktree ${nestedWorktreePath} is clean — skipping`
          );
          continue;
        }

        logger.info(
          `[WorktreeRecovery] Nested worktree ${nestedWorktreePath} has uncommitted changes — copying to main worktree`
        );
        logger.debug(`[WorktreeRecovery] Uncommitted changes:\n${statusOutput}`);
        result.worktreesWithChanges.push(nestedWorktreePath);

        // Parse file paths from `git status --short` output.
        // Format: "XY filename" or "XY old -> new" for renames.
        // Status codes: M=modified, A=added, D=deleted, R=renamed, ??=untracked.
        const changedFiles = statusOutput
          .trim()
          .split('\n')
          .map((line) => {
            const rest = line.slice(3).trim(); // strip 2-char status code + space
            // Handle rename: "old-path -> new-path" — use the new path
            if (rest.includes(' -> ')) {
              return rest.split(' -> ').pop()!.trim();
            }
            return rest;
          })
          .filter(Boolean);

        for (const relPath of changedFiles) {
          const srcPath = path.join(nestedWorktreePath, relPath);
          const destPath = path.join(mainWorktreePath, relPath);

          try {
            // Skip files that no longer exist in the nested worktree (e.g. deletions)
            try {
              await fs.access(srcPath);
            } catch {
              logger.debug(`[WorktreeRecovery] Skipping absent file (likely deleted): ${relPath}`);
              continue;
            }

            await fs.mkdir(path.dirname(destPath), { recursive: true });
            await fs.copyFile(srcPath, destPath);
            result.copiedFiles.push(relPath);
            logger.info(`[WorktreeRecovery] Copied ${relPath} -> main worktree`);
          } catch (copyError) {
            const msg = copyError instanceof Error ? copyError.message : String(copyError);
            logger.error(`[WorktreeRecovery] Failed to copy ${relPath}: ${msg}`);
            result.errors.push(`copy ${relPath}: ${msg}`);
          }
        }

        // Clean up the nested worktree after copying
        try {
          await fs.rm(nestedWorktreePath, { recursive: true, force: true });
          logger.info(`[WorktreeRecovery] Cleaned up nested worktree at ${nestedWorktreePath}`);
        } catch (cleanupError) {
          const msg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          logger.warn(`[WorktreeRecovery] Could not clean up ${nestedWorktreePath}: ${msg}`);
          // Non-fatal — leave cleanup for next run
        }
      } catch (worktreeError) {
        const msg = worktreeError instanceof Error ? worktreeError.message : String(worktreeError);
        logger.error(
          `[WorktreeRecovery] Error processing nested worktree ${nestedWorktreePath}: ${msg}`
        );
        result.errors.push(`process ${nestedWorktreePath}: ${msg}`);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[WorktreeRecovery] Failed to scan for nested worktrees: ${msg}`);
    result.errors.push(`scan: ${msg}`);
  }

  return result;
}
