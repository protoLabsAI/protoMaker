/**
 * Worktree Recovery Service - Post-agent uncommitted work detection and recovery
 *
 * After every agent exits, scans the worktree for uncommitted changes and
 * attempts auto-recovery: format → stage → commit → push → PR creation.
 * Returns structured results; callers are responsible for status updates and events.
 */

import { exec, execFile } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';
import type { Feature } from '@protolabs-ai/types';

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

/**
 * Builds a git add command that stages all changes except .automaker/,
 * then re-includes .automaker/memory/ and .automaker/skills/ only if those
 * directories exist in the working tree. This prevents a fatal pathspec error
 * when a directory is absent (e.g. in a fresh worktree).
 */
function buildGitAddCommand(workDir: string): string {
  const parts = ["git add -A -- ':!.automaker/'"];
  if (existsSync(join(workDir, '.automaker/memory'))) {
    parts.push("'.automaker/memory/'");
  }
  if (existsSync(join(workDir, '.automaker/skills'))) {
    parts.push("'.automaker/skills/'");
  }
  return parts.join(' ');
}

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
 * 5. Create PR via gh CLI targeting main
 *
 * Returns a structured result. The caller is responsible for updating feature
 * status, emitting events, and deciding how to proceed.
 *
 * @param feature - The feature being processed
 * @param worktreePath - Absolute path to the worktree
 */
export async function checkAndRecoverUncommittedWork(
  feature: Feature,
  worktreePath: string
): Promise<WorktreeRecoveryResult> {
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
    try {
      const { stdout: diffOutput } = await execAsync(
        "git diff HEAD --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.css' '*.md'",
        { cwd: worktreePath, env: execEnv }
      );
      const files = diffOutput.trim().split('\n').filter(Boolean);
      if (files.length > 0) {
        await execAsync(
          `npx prettier --ignore-path /dev/null --write ${files.map((f) => `"${f}"`).join(' ')}`,
          { cwd: worktreePath, env: execEnv }
        );
      }
    } catch {
      // Non-fatal: formatting failure should not block recovery
    }

    // Step 2: Stage changed files (exclude .automaker/ except memory/ and skills/ if they exist).
    await execAsync(buildGitAddCommand(worktreePath), {
      cwd: worktreePath,
      env: execEnv,
    });

    // Step 3: Commit with HUSKY=0 / --no-verify to bypass hooks
    const commitTitle = (feature.title || 'feature implementation')
      .replace(/"/g, "'")
      .substring(0, 72);
    const commitMessage = `refactor: ${commitTitle}`;

    await execFileAsync('git', ['commit', '--no-verify', '-m', commitMessage], {
      cwd: worktreePath,
      env: { ...execEnv, HUSKY: '0' },
    });

    logger.info(`[PostAgentHook] Committed uncommitted work for feature ${feature.id}`);

    // Step 4: Push to remote with -u
    await execAsync(`git push -u origin "${branchName}"`, {
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

    const { stdout: prOutput } = await execAsync(
      `gh pr create --base dev --head "${branchName}" --title "${prTitle}" --body "${prBody.replace(/\n/g, '\\n')}"`,
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
    result.error = `git workflow failed — uncommitted work in worktree at ${worktreePath}: ${errorMessage}`;
    logger.error(`[PostAgentHook] Recovery failed for feature ${feature.id}: ${errorMessage}`);
    return result;
  }
}
