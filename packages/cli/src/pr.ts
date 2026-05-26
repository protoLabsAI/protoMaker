/**
 * protomaker pr
 *
 * Pull request commands — create, status, merge.
 *
 * Usage:
 *   protomaker pr create <featureId> [options]
 *   protomaker pr status <prNumber> [options]
 *   protomaker pr merge <prNumber> [options]
 */

import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { output, error, usageError, type GlobalFlags, getOutputMode } from './output.js';
import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreatePRResult {
  branch: string;
  committed: boolean;
  commitHash?: string | null;
  pushed: boolean;
  prUrl?: string | null;
  prNumber?: number;
  prCreated: boolean;
  prAlreadyExisted?: boolean;
  prError?: string;
  browserUrl?: string | null;
  ghCliAvailable: boolean;
}

interface CreatePRResponse {
  success: boolean;
  result?: CreatePRResult;
  error?: string;
}

interface PRCheckStatus {
  allChecksPassed: boolean;
  passedCount: number;
  failedCount: number;
  pendingCount: number;
  failedChecks: string[];
  softFailedChecks: string[];
}

interface PROwnershipStatus {
  instanceId: string | null;
  teamId: string | null;
  createdAt: string | null;
  isOwnedByThisInstance: boolean;
  isStale: boolean;
}

interface CheckPRStatusResponse {
  success: boolean;
  allChecksPassed?: boolean;
  passedCount?: number;
  failedCount?: number;
  pendingCount?: number;
  failedChecks?: string[];
  softFailedChecks?: string[];
  ownership?: PROwnershipStatus;
  error?: string;
}

interface PRMergeResponse {
  success: boolean;
  mergeCommitSha?: string;
  autoMergeEnabled?: boolean;
  checksPending?: boolean;
  checksFailed?: boolean;
  failedChecks?: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract global flags from Commander opts.
 */
function getGlobalFlags(opts: Record<string, unknown>): GlobalFlags {
  return {
    json: opts.json === true,
    quiet: opts.quiet === true,
    project: (opts.project as string) ?? process.cwd(),
  };
}

/**
 * Create an API client from global flags.
 */
function createClient(flags: GlobalFlags): ApiClient {
  const config = resolveApiConfig(flags.project);
  return new ApiClient(config);
}

/**
 * Format check status as a human-readable badge.
 */
function checkBadge(passed: number, failed: number, pending: number): string {
  const parts: string[] = [];
  if (passed > 0) parts.push(`✅ ${passed} passed`);
  if (failed > 0) parts.push(`❌ ${failed} failed`);
  if (pending > 0) parts.push(`⏳ ${pending} pending`);
  return parts.length > 0 ? parts.join(', ') : 'No checks found';
}

/**
 * Render the PR status report.
 */
function renderPRStatus(data: CheckPRStatusResponse): string {
  const lines: string[] = [];
  const passed = data.passedCount ?? 0;
  const failed = data.failedCount ?? 0;
  const pending = data.pendingCount ?? 0;
  const allPassed = data.allChecksPassed ?? false;

  lines.push('');
  lines.push(
    `CI Status: ${allPassed ? '✅ All checks passed' : failed > 0 ? '❌ Checks failed' : '⏳ Checks pending'}`
  );
  lines.push(`  ${checkBadge(passed, failed, pending)}`);

  if (data.failedChecks && data.failedChecks.length > 0) {
    lines.push('');
    lines.push('Failed checks:');
    for (const check of data.failedChecks) {
      lines.push(`  • ${check}`);
    }
  }

  if (data.softFailedChecks && data.softFailedChecks.length > 0) {
    lines.push('');
    lines.push('Soft failures (non-blocking):');
    for (const check of data.softFailedChecks) {
      lines.push(`  • ${check}`);
    }
  }

  if (data.ownership) {
    lines.push('');
    lines.push(`Owned by this instance: ${data.ownership.isOwnedByThisInstance ? 'yes' : 'no'}`);
    lines.push(`Stale: ${data.ownership.isStale ? 'yes' : 'no'}`);
    if (data.ownership.instanceId) lines.push(`Instance: ${data.ownership.instanceId}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render the merge result.
 */
function renderMergeResult(data: PRMergeResponse): string {
  const lines: string[] = [];
  lines.push('');

  if (data.success) {
    if (data.autoMergeEnabled) {
      lines.push('✅ Auto-merge enabled — PR will merge automatically when checks pass.');
    } else if (data.mergeCommitSha) {
      lines.push(`✅ PR merged. Commit: ${data.mergeCommitSha}`);
    } else {
      lines.push('✅ PR merged successfully.');
    }
  } else {
    if (data.checksPending) {
      lines.push('⏳ Merge blocked — CI checks are still pending.');
    } else if (data.checksFailed) {
      lines.push('❌ Merge blocked — CI checks failed.');
      if (data.failedChecks && data.failedChecks.length > 0) {
        lines.push('Failed checks:');
        for (const check of data.failedChecks) {
          lines.push(`  • ${check}`);
        }
      }
    } else {
      lines.push(`❌ Merge failed: ${data.error || 'Unknown error'}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * protomaker pr create <featureId>
 *
 * Open a PR from a feature worktree. Commits unpushed changes, pushes the
 * branch, and creates (or reuses) the PR on GitHub.
 *
 * Options: --commit-message, --pr-title, --pr-body, --base-branch, --draft
 */
export function createCommand(parent: Command): void {
  const cmd = new Command('create <featureId>');
  cmd.description('Open a PR from a feature worktree');
  cmd.option('--commit-message <text>', 'Commit message for unpushed changes');
  cmd.option('--pr-title <text>', 'Pull request title');
  cmd.option('--pr-body <text>', 'Pull request body');
  cmd.option('--base-branch <branch>', 'Target base branch');
  cmd.option('--draft', 'Create as draft PR');

  cmd.action(async (featureId: string, opts) => {
    const flags = getGlobalFlags(opts);
    const client = createClient(flags);

    const body: Record<string, unknown> = {
      featureId,
      projectPath: flags.project,
    };

    if (opts.commitMessage) body.commitMessage = opts.commitMessage;
    if (opts.prTitle) body.prTitle = opts.prTitle;
    if (opts.prBody) body.prBody = opts.prBody;
    if (opts.baseBranch) body.baseBranch = opts.baseBranch;
    if (opts.draft) body.draft = true;

    const result = await client.post<CreatePRResponse>('/worktree/create-pr', body);

    if (!result.ok) {
      error(result.error || 'Failed to create PR');
      process.exit(1);
      return;
    }

    const prResult = result.data?.result;
    if (!prResult) {
      error('No result returned from server');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(prResult, flags);
    } else {
      const lines: string[] = [];
      lines.push('');

      if (prResult.committed && prResult.commitHash) {
        lines.push(`  Committed: ${prResult.commitHash}`);
      }
      lines.push(`  Pushed:    ${prResult.pushed ? 'yes' : 'no'}`);
      lines.push(`  Branch:    ${prResult.branch}`);

      if (prResult.prCreated && prResult.prUrl) {
        lines.push(`  PR:        ${prResult.prUrl}`);
        if (prResult.prNumber) lines.push(`  Number:    #${prResult.prNumber}`);
        if (prResult.prAlreadyExisted) lines.push('  (PR already existed)');
      } else if (prResult.prError) {
        lines.push(`  PR Error:  ${prResult.prError}`);
        if (prResult.browserUrl) {
          lines.push('');
          lines.push('  Create in browser:');
          lines.push(`    ${prResult.browserUrl}`);
        }
      }

      lines.push('');
      output(lines.join('\n'), flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker pr status <prNumber>
 *
 * Show CI rollup for a pull request (check statuses, ownership, staleness).
 */
export function statusCommand(parent: Command): void {
  const cmd = new Command('status <prNumber>');
  cmd.description('Show CI rollup for a pull request');

  cmd.action(async (prNumberArg: string, opts) => {
    const flags = getGlobalFlags(opts);
    const client = createClient(flags);

    const prNumber = parseInt(prNumberArg, 10);
    if (isNaN(prNumber)) {
      usageError(`Invalid PR number: "${prNumberArg}"`);
      return;
    }

    const result = await client.post<CheckPRStatusResponse>('/github/check-pr-status', {
      projectPath: flags.project,
      prNumber,
    });

    if (!result.ok) {
      error(result.error || `Failed to check PR #${prNumber} status`);
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(result.data, flags);
    } else {
      output(renderPRStatus(result.data ?? { success: false }), flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker pr merge <prNumber>
 *
 * Merge a PR with the configured strategy (defaults to squash).
 *
 * Options: --strategy <merge|squash|rebase>, --no-wait-for-ci
 */
export function mergeCommand(parent: Command): void {
  const cmd = new Command('merge <prNumber>');
  cmd.description('Merge a pull request with the configured strategy');
  cmd.option('--strategy <strategy>', 'Merge strategy (merge, squash, rebase)', 'squash');
  cmd.option('--no-wait-for-ci', 'Do not wait for CI checks before merging');

  cmd.action(async (prNumberArg: string, opts) => {
    const flags = getGlobalFlags(opts);
    const client = createClient(flags);

    const prNumber = parseInt(prNumberArg, 10);
    if (isNaN(prNumber)) {
      usageError(`Invalid PR number: "${prNumberArg}"`);
      return;
    }

    const validStrategies = ['merge', 'squash', 'rebase'];
    if (!validStrategies.includes(opts.strategy)) {
      usageError(
        `Invalid strategy "${opts.strategy}". Must be one of: ${validStrategies.join(', ')}`
      );
      return;
    }

    const result = await client.post<PRMergeResponse>('/github/merge-pr', {
      projectPath: flags.project,
      prNumber,
      strategy: opts.strategy,
      waitForCI: !opts.noWaitForCi,
    });

    if (!result.ok) {
      error(result.error || `Failed to merge PR #${prNumber}`);
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(result.data, flags);
    } else {
      output(renderMergeResult(result.data ?? { success: false }), flags);
    }
  });

  parent.addCommand(cmd);
}
