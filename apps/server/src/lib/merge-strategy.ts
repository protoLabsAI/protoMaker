/**
 * Shared merge strategy resolution for PRs.
 *
 * PRs targeting staging, main, or epic/* always use --merge to preserve the DAG.
 * All others default to --squash.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Resolve the gh CLI merge flag for a PR based on its base branch.
 * PRs targeting staging, main, or epic/* always use --merge.
 * All others default to --squash.
 */
export async function resolveMergeStrategy(
  prNumber: number,
  cwd: string
): Promise<'--squash' | '--merge'> {
  try {
    const { stdout } = await execAsync(
      `gh pr view ${prNumber} --json baseRefName --jq '.baseRefName'`,
      { cwd, timeout: 15000 }
    );
    const baseBranch = stdout.trim();
    if (baseBranch === 'staging' || baseBranch === 'main' || baseBranch.startsWith('epic/')) {
      return '--merge';
    }
  } catch {
    // Fall through to default
  }
  return '--squash';
}
