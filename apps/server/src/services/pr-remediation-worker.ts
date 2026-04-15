/**
 * PrRemediationWorker — shared base for PR branch checkout and safe git operations.
 *
 * Provides reusable infrastructure for services that need to:
 * - Fetch and inspect PR branches
 * - Run git operations with proper timeouts
 * - Execute prettier for format remediation
 * - Clean up temporary resources
 *
 * Both format-failure remediation and conflict classification use this base.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';

const execAsync = promisify(exec);
const logger = createLogger('PrRemediationWorker');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitRunOptions {
  cwd: string;
  timeout?: number;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
}

export interface ScratchWorktree {
  /** Absolute path to the temporary directory */
  dir: string;
  /** Branch that was checked out */
  branch: string;
}

// ---------------------------------------------------------------------------
// Worker class
// ---------------------------------------------------------------------------

/**
 * Shared base class for PR remediation operations.
 *
 * Callers are responsible for calling cleanup() in a finally block.
 */
export class PrRemediationWorker {
  /**
   * Create a temporary directory for PR branch operations.
   * The prefix `pr-remediation-` identifies these dirs in /tmp.
   */
  async createScratchDir(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pr-remediation-'));
    logger.debug(`[Worker] Created scratch dir: ${dir}`);
    return dir;
  }

  /**
   * Run a git command in a directory and return trimmed stdout.
   * Throws on non-zero exit code.
   */
  async runGit(args: string, options: GitRunOptions): Promise<string> {
    const { cwd, timeout = 30000 } = options;
    try {
      const { stdout } = await execAsync(`git ${args}`, { cwd, timeout });
      return stdout.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug(`[Worker] git ${args.slice(0, 60)} failed: ${msg}`);
      throw err;
    }
  }

  /**
   * Run a git command and return both stdout and stderr (without throwing).
   * Useful for commands where stderr output is informational.
   */
  async runGitSafe(args: string, options: GitRunOptions): Promise<GitRunResult> {
    const { cwd, timeout = 30000 } = options;
    try {
      const { stdout, stderr } = await execAsync(`git ${args}`, { cwd, timeout });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (err: unknown) {
      const exitError = err as { stdout?: string; stderr?: string };
      return {
        stdout: (exitError.stdout ?? '').trim(),
        stderr: (exitError.stderr ?? '').trim(),
      };
    }
  }

  /**
   * Get the list of files changed in a PR relative to its base branch.
   *
   * Requires both the PR branch and the base branch to be accessible in cwd.
   * Uses triple-dot diff to show only commits unique to headBranch since it
   * diverged from baseBranch.
   */
  async getChangedFiles(cwd: string, baseBranch: string, headBranch: string): Promise<string[]> {
    // Ensure base is available
    await this.runGitSafe(`fetch origin ${baseBranch} --depth=1`, { cwd, timeout: 30000 });

    const output = await this.runGit(
      `diff --name-only origin/${baseBranch}...origin/${headBranch}`,
      { cwd, timeout: 15000 }
    );
    return output.split('\n').filter(Boolean);
  }

  /**
   * Run prettier --write on the given file paths.
   *
   * Uses the project's own prettier installation at `prettierBin`.
   * Runs from `cwd` so .prettierrc / .prettierignore are resolved correctly.
   *
   * Returns the list of files that were actually modified.
   */
  async runPrettier(prettierBin: string, files: string[], cwd: string): Promise<string[]> {
    if (files.length === 0) return [];

    // Quote each file path for safety
    const quotedFiles = files.map((f) => JSON.stringify(f)).join(' ');
    const cmd = `node ${JSON.stringify(prettierBin)} --ignore-path /dev/null --write ${quotedFiles}`;

    logger.debug(`[Worker] Running prettier on ${files.length} file(s) in ${cwd}`);

    await execAsync(cmd, { cwd, timeout: 60000 });

    // Determine which files were actually modified
    const modifiedFiles: string[] = [];
    for (const file of files) {
      const result = await this.runGitSafe(`diff --name-only -- ${JSON.stringify(file)}`, {
        cwd,
        timeout: 5000,
      });
      if (result.stdout) {
        modifiedFiles.push(file);
      }
    }
    return modifiedFiles;
  }

  /**
   * Get the list of files modified in the working tree (unstaged and staged).
   * Used for scope checking after prettier runs.
   */
  async getModifiedFiles(cwd: string): Promise<string[]> {
    const result = await this.runGitSafe('diff --name-only HEAD', { cwd, timeout: 10000 });
    return result.stdout.split('\n').filter(Boolean);
  }

  /**
   * Commit modified files with an auto-remediation message and machine-parseable audit trailer.
   *
   * Returns the new commit SHA.
   */
  async commitRemediationFix(cwd: string, prNumber: number, filesFixed: string[]): Promise<string> {
    // Stage only the files that were modified
    const quotedFiles = filesFixed.map((f) => JSON.stringify(f)).join(' ');
    await execAsync(`git add -- ${quotedFiles}`, { cwd, timeout: 10000 });

    const timestamp = new Date().toISOString();
    const trailers = [
      `Auto-Remediation: format-fix`,
      `PR-Number: ${prNumber}`,
      `Files-Fixed: ${filesFixed.length}`,
      `Remediation-Timestamp: ${timestamp}`,
    ].join('\n');

    const commitMsg = `style: prettier fix (auto-remediation)\n\n${trailers}`;

    await execAsync(`git commit -m ${JSON.stringify(commitMsg)}`, { cwd, timeout: 15000 });

    const sha = await this.runGit('rev-parse HEAD', { cwd, timeout: 5000 });
    logger.info(`[Worker] Committed format fix for PR #${prNumber} → ${sha}`);
    return sha;
  }

  /**
   * Push the current branch to origin.
   */
  async pushBranch(cwd: string, branchName: string): Promise<void> {
    await execAsync(`git push origin ${JSON.stringify(branchName)}`, { cwd, timeout: 30000 });
    logger.info(`[Worker] Pushed branch ${branchName}`);
  }

  /**
   * Check if a commit matching the auto-remediation pattern already exists
   * on the PR branch relative to the base. Returns true if a cap-triggering
   * commit is found (prevents infinite remediation loops).
   */
  async hasExistingRemediationCommit(
    cwd: string,
    baseBranch: string,
    headBranch: string
  ): Promise<boolean> {
    await this.runGitSafe(`fetch origin ${baseBranch} --depth=1`, { cwd, timeout: 30000 });
    await this.runGitSafe(`fetch origin ${headBranch} --depth=10`, { cwd, timeout: 30000 });

    const result = await this.runGitSafe(
      `log --oneline origin/${baseBranch}..origin/${headBranch} --grep=auto-remediation`,
      { cwd, timeout: 10000 }
    );
    return result.stdout.length > 0;
  }

  /**
   * Remove the scratch directory. Must be called in a finally block.
   */
  async cleanup(scratchDir: string): Promise<void> {
    try {
      await rm(scratchDir, { recursive: true, force: true });
      logger.debug(`[Worker] Cleaned up scratch dir: ${scratchDir}`);
    } catch (err) {
      logger.warn(`[Worker] Failed to clean up scratch dir ${scratchDir}:`, err);
    }
  }
}
