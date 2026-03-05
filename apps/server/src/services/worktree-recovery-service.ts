/**
 * Worktree Recovery Service - Post-agent uncommitted work detection and recovery
 *
 * After every agent exits, scans the worktree for uncommitted changes and
 * attempts auto-recovery: format → stage → commit → push → PR creation.
 * Returns structured results; callers are responsible for status updates and events.
 */

import { exec, execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import { DEFAULT_GIT_WORKFLOW_SETTINGS } from '@protolabsai/types';
import { buildGitAddCommand } from '../lib/git-staging-utils.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const logger = createLogger('WorktreeRecovery');

// Extended PATH for git/gh CLI availability (mirrors git-workflow-service pattern)
const pathSeparator = process.platform === 'win32' ? ';' : ':';
const additionalPaths: string[] = [];

if (process.platform === 'win32') {
  if (process.env.LOCALAPPDATA) {
    additionalPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`);
  }
  if (process.env.PROGRAMFILES) {
    additionalPaths.push(`${process.env.PROGRAMFILES}\\Git\\cmd`);
  }
} else {
  additionalPaths.push(
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    `${process.env.HOME}/.local/bin`
  );
}

const extendedPath = [process.env.PATH, ...additionalPaths.filter(Boolean)]
  .filter(Boolean)
  .join(pathSeparator);

const execEnv = { ...process.env, PATH: extendedPath, HUSKY: '0' };

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
