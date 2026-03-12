/**
 * Git Workflow Service - Automated git operations after feature completion
 *
 * Handles automatic commit, push, and PR creation when agents successfully
 * complete features in auto-mode.
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { randomUUID } from 'crypto';
import { createLogger } from '@protolabsai/utils';
import { buildGitAddCommand } from '../lib/git-staging-utils.js';
import type {
  Feature,
  GitWorkflowSettings,
  GitWorkflowResult,
  GlobalSettings,
} from '@protolabsai/types';
import { DEFAULT_GIT_WORKFLOW_SETTINGS } from '@protolabsai/types';
import { updateWorktreePRInfo } from '../lib/worktree-metadata.js';
import { validatePRState } from '@protolabsai/types';
import { githubMergeService } from './github-merge-service.js';
import { codeRabbitResolverService } from './coderabbit-resolver-service.js';
import type { EventEmitter } from '../lib/events.js';
import { buildPROwnershipWatermark } from '../routes/github/utils/pr-ownership.js';
import { createGitExecEnv, extractTitleFromDescription } from '@protolabsai/git-utils';
import type { ActionableItemService } from './actionable-item-service.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const logger = createLogger('GitWorkflow');

/**
 * Retry helper with exponential backoff.
 * Retries up to 3 times with delays of 2s, 4s, 8s.
 * @param operation - The async operation to retry
 * @param operationName - Name for logging
 * @returns Result of the operation
 */
async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        // Final failure after all retries
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`${operationName} failed after ${maxRetries} retries: ${errorMessage}`);
        throw error;
      }

      // Calculate exponential delay: 2s, 4s, 8s
      const delay = baseDelay * Math.pow(2, attempt - 1);
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        `${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay / 1000}s: ${errorMessage}`
      );

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // TypeScript satisfaction (unreachable)
  throw new Error('Unreachable');
}

const execEnv = createGitExecEnv();

/**
 * Build PR body with issue closing references.
 * Appends "Closes #N" when the feature has a linked GitHub issue,
 * so that merging the PR auto-closes the issue.
 */
function buildPRBody(feature: Feature): string {
  const summary = feature.description.substring(0, 500);
  const ellipsis = feature.description.length > 500 ? '...' : '';
  let body = `## Summary\n\n${summary}${ellipsis}`;

  // Append closing reference for linked GitHub issues
  const issueRef = getGitHubIssueRef(feature);
  if (issueRef) {
    body += `\n\n${issueRef}`;
  }

  body += `\n\n---\n*Created automatically by Automaker*`;
  return body;
}

/**
 * Extract a GitHub issue closing reference from the feature.
 * Checks explicit fields first, then parses URLs from title/description.
 */
function getGitHubIssueRef(feature: Feature): string | null {
  // Explicit field takes priority
  if (feature.githubIssueNumber) {
    return `Closes #${feature.githubIssueNumber}`;
  }
  if (feature.githubIssueUrl) {
    return `Closes ${feature.githubIssueUrl}`;
  }

  // Parse issue URLs from title and description
  const text = `${feature.title || ''} ${feature.description || ''}`;
  const issueUrlPattern = /https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/g;
  const matches = [...text.matchAll(issueUrlPattern)];
  if (matches.length > 0) {
    // Deduplicate by issue number
    const seen = new Set<string>();
    const refs: string[] = [];
    for (const match of matches) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        refs.push(`Closes ${match[0]}`);
      }
    }
    return refs.join('\n');
  }

  return null;
}

/**
 * Check if gh CLI is available on the system
 */
async function isGhCliAvailable(): Promise<boolean> {
  try {
    const checkCommand = process.platform === 'win32' ? 'where gh' : 'command -v gh';
    await execAsync(checkCommand, { env: execEnv });
    return true;
  } catch {
    return false;
  }
}

/**
 * Recent operation entry for status tracking
 */
interface RecentOperation {
  type: 'commit' | 'push' | 'pr_create' | 'merge';
  featureId: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

/**
 * Git workflow service status
 */
export interface GitWorkflowStatus {
  activeWorkflows: number;
  recentOperations: RecentOperation[];
}

export class GitWorkflowService {
  private activeWorkflows = 0;
  private recentOperations: RecentOperation[] = [];
  private readonly MAX_RECENT_OPERATIONS = 10;
  private actionableItemService?: ActionableItemService;

  /**
   * Wire in the ActionableItemService for creating oversized-PR actionable items.
   */
  setActionableItemService(service: ActionableItemService): void {
    this.actionableItemService = service;
  }

  /**
   * Get current status of the git workflow service
   */
  getStatus(): GitWorkflowStatus {
    return {
      activeWorkflows: this.activeWorkflows,
      recentOperations: [...this.recentOperations],
    };
  }

  /**
   * Track a workflow operation
   */
  private trackOperation(
    type: RecentOperation['type'],
    featureId: string,
    success: boolean,
    error?: string
  ): void {
    this.recentOperations.unshift({
      type,
      featureId,
      timestamp: new Date().toISOString(),
      success,
      error,
    });

    // Keep only the last N operations
    if (this.recentOperations.length > this.MAX_RECENT_OPERATIONS) {
      this.recentOperations = this.recentOperations.slice(0, this.MAX_RECENT_OPERATIONS);
    }
  }

  /**
   * Resolve effective git workflow settings for a feature.
   * Feature-level settings override global settings.
   */
  resolveGitWorkflowSettings(
    feature: Feature,
    globalSettings: GlobalSettings
  ): Required<GitWorkflowSettings> {
    const global = globalSettings.gitWorkflow ?? DEFAULT_GIT_WORKFLOW_SETTINGS;
    const featureOverride = feature.gitWorkflow ?? {};

    return {
      autoCommit:
        featureOverride.autoCommit ?? global.autoCommit ?? DEFAULT_GIT_WORKFLOW_SETTINGS.autoCommit,
      autoPush:
        featureOverride.autoPush ?? global.autoPush ?? DEFAULT_GIT_WORKFLOW_SETTINGS.autoPush,
      autoCreatePR:
        featureOverride.autoCreatePR ??
        global.autoCreatePR ??
        DEFAULT_GIT_WORKFLOW_SETTINGS.autoCreatePR,
      autoMergePR:
        featureOverride.autoMergePR ??
        global.autoMergePR ??
        DEFAULT_GIT_WORKFLOW_SETTINGS.autoMergePR,
      prMergeStrategy:
        featureOverride.prMergeStrategy ??
        global.prMergeStrategy ??
        DEFAULT_GIT_WORKFLOW_SETTINGS.prMergeStrategy,
      waitForCI:
        featureOverride.waitForCI ?? global.waitForCI ?? DEFAULT_GIT_WORKFLOW_SETTINGS.waitForCI,
      prBaseBranch:
        featureOverride.prBaseBranch ??
        global.prBaseBranch ??
        DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch,
      maxPRLinesChanged:
        featureOverride.maxPRLinesChanged ??
        global.maxPRLinesChanged ??
        DEFAULT_GIT_WORKFLOW_SETTINGS.maxPRLinesChanged,
      maxPRFilesTouched:
        featureOverride.maxPRFilesTouched ??
        global.maxPRFilesTouched ??
        DEFAULT_GIT_WORKFLOW_SETTINGS.maxPRFilesTouched,
    };
  }

  /**
   * Save agent progress as a WIP commit when an agent is interrupted (e.g., turn limit).
   * Commits and pushes any uncommitted work so the next retry agent can pick up where
   * the previous one left off instead of starting from scratch.
   *
   * This is a lightweight operation — no PR creation, no merge, no changeset.
   * Returns the commit hash if work was saved, null if there was nothing to commit.
   */
  async saveAgentProgress(
    workDir: string,
    feature: Feature,
    branchName: string,
    projectPath?: string
  ): Promise<string | null> {
    try {
      // Check for uncommitted changes
      const { stdout: status } = await execAsync('git status --porcelain --untracked-files=all', {
        cwd: workDir,
        env: execEnv,
      });

      if (!status.trim()) {
        logger.debug(`No uncommitted changes to save for feature ${feature.id}`);
        return null;
      }

      logger.info(
        `Saving agent progress for feature ${feature.id} (${status.trim().split('\n').length} files changed)`
      );

      // Stage all changes - exclude .automaker/ except memory/ and skills/ (if they exist).
      await execAsync(buildGitAddCommand(workDir), { cwd: workDir, env: execEnv });

      // Format staged files before committing
      // Use the main repo's prettier binary — worktrees have no node_modules/
      try {
        const { stdout: stagedFiles } = await execAsync(
          "git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.css' '*.md'",
          { cwd: workDir, env: execEnv }
        );
        const files = stagedFiles.trim().split('\n').filter(Boolean);
        if (files.length > 0) {
          const repoRoot = projectPath || workDir;
          const prettierBin = path.join(repoRoot, 'node_modules/.bin/prettier');
          await execAsync(
            `node "${prettierBin}" --ignore-path /dev/null --write ${files.map((f) => `"${f}"`).join(' ')}`,
            { cwd: workDir, env: execEnv }
          );
          await execAsync(buildGitAddCommand(workDir), { cwd: workDir, env: execEnv });
        }
      } catch {
        // Non-fatal: formatting failure shouldn't block progress save
      }

      // Create WIP commit
      const title = feature.title || 'agent work';
      const commitMessage = `wip: ${title}\n\nAgent progress checkpoint — interrupted before completion.\nFeature ID: ${feature.id}`;
      await execFileAsync('git', ['commit', '--no-verify', '-m', commitMessage], {
        cwd: workDir,
        env: execEnv,
      });

      // Get commit hash
      const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: workDir,
        env: execEnv,
      });
      const hash = hashOutput.trim().substring(0, 8);

      // Push to remote with retry logic
      try {
        await retryWithExponentialBackoff(async () => {
          await execAsync(`git push origin ${branchName}`, {
            cwd: workDir,
            env: execEnv,
          });
        }, `Push agent progress for ${branchName}`);
        logger.info(
          `Saved agent progress for feature ${feature.id}: commit ${hash}, pushed to ${branchName}`
        );
      } catch (pushError) {
        logger.warn(
          `Progress committed (${hash}) but push failed: ${pushError instanceof Error ? pushError.message : String(pushError)}`
        );
      }

      this.trackOperation('commit', feature.id, true);
      return hash;
    } catch (error) {
      logger.warn(
        `Failed to save agent progress for feature ${feature.id}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Run the complete git workflow after feature completion.
   * Operations are best-effort: failures in later steps don't prevent earlier steps from succeeding.
   *
   *
   * @param projectPath - Absolute path to the main project (for storing PR metadata)
   * @param featureId - The feature ID
   * @param feature - The feature object
   * @param workDir - Working directory (worktree path or project path)
   * @param settings - Global settings containing git workflow config
   * @param epicBranchName - Optional epic branch name to use as PR base (for features in epics)
   * @param events - Optional event emitter for emitting workflow events
   * @returns GitWorkflowResult with details of what was done, or null if no workflow needed
   */
  async runPostCompletionWorkflow(
    projectPath: string,
    featureId: string,
    feature: Feature,
    workDir: string,
    settings: GlobalSettings,
    epicBranchName?: string,
    events?: EventEmitter
  ): Promise<GitWorkflowResult | null> {
    const gitSettings = this.resolveGitWorkflowSettings(feature, settings);

    // Determine PR base branch:
    // - If feature belongs to an epic and epicBranchName is provided, use it
    // - If feature is an epic itself, use the default base (main)
    // - Otherwise use the default base from settings
    let rawBaseBranch =
      epicBranchName && !feature.isEpic ? epicBranchName : gitSettings.prBaseBranch;

    // If targeting an epic branch, verify it exists on remote. The first feature
    // in an epic may run before the epic branch is created — fall back to the
    // default base branch (usually dev) to avoid silent PR creation failure.
    if (epicBranchName && !feature.isEpic && rawBaseBranch === epicBranchName) {
      try {
        await execAsync(`git ls-remote --exit-code origin refs/heads/${epicBranchName}`, {
          cwd: workDir,
          env: execEnv,
          timeout: 15_000,
        });
      } catch {
        logger.warn(
          `Epic branch "${epicBranchName}" does not exist on remote — falling back to "${gitSettings.prBaseBranch}" as PR base for feature ${featureId}`
        );
        rawBaseBranch = gitSettings.prBaseBranch;
      }
    }

    // Sanitize branch name to prevent shell injection — allow only valid git ref characters
    const prBaseBranch = rawBaseBranch.replace(/[^a-zA-Z0-9_./-]/g, '');

    logger.debug(
      `Git workflow for ${featureId}: isEpic=${feature.isEpic}, epicId=${feature.epicId}, base=${prBaseBranch}`
    );

    // If all operations disabled, skip entirely
    if (!gitSettings.autoCommit) {
      logger.debug(`Git workflow disabled for feature ${featureId}`);
      return null;
    }

    // Track active workflow
    this.activeWorkflows++;

    const result: GitWorkflowResult = {
      commitHash: null,
      pushed: false,
      prUrl: null,
    };

    // Check if feature has a branch name (required for push/PR)
    const branchName = feature.branchName;
    if (!branchName) {
      logger.debug(`Feature ${featureId} has no branchName, skipping git workflow`);
      return null;
    }

    try {
      // Step 1: Commit changes
      let commitHash: string | null;
      commitHash = await this.commitChanges(workDir, feature, projectPath);

      if (!commitHash) {
        // Agent may have already committed. Check for unpushed commits before bailing out.
        const unpushedHash = await this.getUnpushedCommitHash(workDir, branchName);
        if (!unpushedHash) {
          // Agent may have committed AND pushed already. Check if the remote branch is ahead of base.
          const remoteAheadHash = await this.getRemoteAheadCommitHash(
            workDir,
            branchName,
            prBaseBranch
          );
          if (!remoteAheadHash) {
            logger.info(
              `No changes to commit and no commits ahead of base for feature ${featureId}`
            );
            this.activeWorkflows--;
            return null;
          }
          // Agent pre-committed AND pre-pushed — format all changed files and push a fix commit.
          logger.info(
            `Agent pre-pushed commits for feature ${featureId} — applying format fix across PR diff`
          );
          await this.formatAndPushAlreadyPushedBranch(
            workDir,
            branchName,
            prBaseBranch,
            projectPath
          );
          const { stdout: headAfterFmt } = await execAsync('git rev-parse --short HEAD', {
            cwd: workDir,
            env: execEnv,
          });
          commitHash = headAfterFmt.trim();
        } else {
          // Agent pre-committed but not yet pushed — format and amend, then continue pipeline
          logger.info(
            `No uncommitted changes but found unpushed commits for feature ${featureId}, continuing pipeline`
          );
          await this.formatAndAmendLastCommit(workDir, projectPath);
          commitHash = unpushedHash;
        }
      }
      result.commitHash = commitHash;
      this.trackOperation('commit', featureId, true);
      logger.info(`Committed changes for feature ${featureId}: ${commitHash}`);

      // Step 1.5: Rebase before push to prevent CONFLICTING PRs
      let needsForceWithLease = false;

      if (gitSettings.autoPush) {
        try {
          const targetBranch = `origin/${prBaseBranch}`;
          logger.info(`Rebasing branch ${branchName} onto ${targetBranch} before push`);
          await execAsync(`git fetch origin ${prBaseBranch}`, {
            cwd: workDir,
            env: execEnv,
            timeout: 30_000,
          });
          await execAsync(`git rebase ${targetBranch}`, {
            cwd: workDir,
            env: execEnv,
            timeout: 60_000,
          });
          needsForceWithLease = true;
          logger.info(`Successfully rebased branch ${branchName} onto ${targetBranch}`);
        } catch (rebaseError) {
          const errorMsg = rebaseError instanceof Error ? rebaseError.message : String(rebaseError);
          if (errorMsg.includes('conflict') || errorMsg.includes('CONFLICT')) {
            logger.warn(
              `Rebase conflicts for ${branchName}, aborting rebase — PR may need manual rebase`
            );
            try {
              await execAsync('git rebase --abort', { cwd: workDir, env: execEnv });
            } catch {
              // Best-effort abort
            }
          } else {
            logger.warn(`Rebase failed for ${branchName}: ${errorMsg} — continuing without rebase`);
            try {
              await execAsync('git rebase --abort', { cwd: workDir, env: execEnv });
            } catch {
              // Best-effort abort — may not be in rebase state
            }
          }
        }
      }

      // Step 2: Push to remote (if enabled)
      if (gitSettings.autoPush) {
        try {
          const pushed = await this.pushToRemote(workDir, branchName, needsForceWithLease);
          result.pushed = pushed;
          if (pushed) {
            this.trackOperation('push', featureId, true);
            logger.info(`Pushed branch ${branchName} to remote`);
          }
        } catch (pushError) {
          const errorMsg = pushError instanceof Error ? pushError.message : String(pushError);
          this.trackOperation('push', featureId, false, errorMsg);
          logger.warn(`Failed to push branch ${branchName}: ${errorMsg}`);
          result.error = `Push failed: ${errorMsg}`;
          // Continue - commit succeeded, push failed
        }

        // Step 3: Create PR (if push succeeded and PR creation enabled)
        if (result.pushed && gitSettings.autoCreatePR) {
          try {
            const prResult = await this.createPullRequest(
              workDir,
              projectPath,
              feature,
              branchName,
              prBaseBranch,
              settings.instanceId,
              settings.teamId
            );
            result.prUrl = prResult.prUrl;
            result.prNumber = prResult.prNumber;
            result.prAlreadyExisted = prResult.prAlreadyExisted;
            if (result.prUrl) {
              this.trackOperation('pr_create', featureId, true);
              logger.info(`PR ${result.prAlreadyExisted ? 'exists' : 'created'}: ${result.prUrl}`);
            }

            // Step 3.5: Check PR size and flag if oversized (non-blocking)
            if (result.prNumber) {
              await this.checkAndFlagOversizedPR(
                workDir,
                projectPath,
                feature,
                featureId,
                result.prNumber,
                result.prUrl,
                prBaseBranch,
                gitSettings.maxPRLinesChanged,
                gitSettings.maxPRFilesTouched
              );
            }
          } catch (prError) {
            const errorMsg = prError instanceof Error ? prError.message : String(prError);
            this.trackOperation('pr_create', featureId, false, errorMsg);
            logger.warn(`Failed to create PR for branch ${branchName}: ${errorMsg}`);
            result.error = result.error
              ? `${result.error}; PR failed: ${errorMsg}`
              : `PR failed: ${errorMsg}`;
            // Continue - commit and push succeeded, PR failed
          }
        }

        // Step 5: Auto-merge PR (if PR was created/exists and auto-merge enabled)
        if (result.prNumber && gitSettings.autoMergePR) {
          try {
            const mergeStrategy = gitSettings.prMergeStrategy || 'squash';
            const waitForCI = gitSettings.waitForCI ?? true;

            logger.info(
              `Auto-merging PR #${result.prNumber} with strategy: ${mergeStrategy}, waitForCI: ${waitForCI}`
            );

            // Step 5a: Check for critical threads and resolve non-critical bot threads before merge
            // This runs after CI passes (checked by mergePR) but before the actual merge
            // Only check/resolve threads if waitForCI is true (we're checking CI status)
            if (waitForCI) {
              try {
                logger.info(`Checking review threads for PR #${result.prNumber}`);

                // First check for critical threads that would block merge
                const hasCriticalThreads = await this.checkForCriticalThreads(
                  workDir,
                  result.prNumber
                );

                if (hasCriticalThreads) {
                  logger.warn(
                    `PR #${result.prNumber} has unresolved critical review threads, blocking merge`
                  );
                  result.merged = false;
                  const blockError = 'Merge blocked: unresolved critical review threads exist';
                  result.error = result.error ? `${result.error}; ${blockError}` : blockError;

                  // Emit event for monitoring
                  if (events) {
                    events.emit('pr:merge-blocked-critical-threads', {
                      featureId,
                      projectPath,
                      prNumber: result.prNumber,
                      prUrl: result.prUrl,
                    });
                  }

                  // Don't attempt merge if critical threads exist
                  return result;
                }

                // No critical threads - proceed with resolving non-critical bot threads
                logger.info(`Resolving non-critical bot review threads for PR #${result.prNumber}`);
                const resolveResult = await codeRabbitResolverService.resolveThreads(
                  workDir,
                  result.prNumber
                );

                if (resolveResult.success && resolveResult.resolvedCount > 0) {
                  logger.info(
                    `Resolved ${resolveResult.resolvedCount} bot review thread(s) for PR #${result.prNumber}`
                  );
                } else if (!resolveResult.success) {
                  logger.warn(
                    `Failed to resolve bot review threads: ${resolveResult.error || 'Unknown error'}`
                  );
                  // Don't fail the merge if thread resolution fails - it's best effort
                }
              } catch (resolveError) {
                const resolveErrorMsg =
                  resolveError instanceof Error ? resolveError.message : String(resolveError);
                logger.warn(`Error checking/resolving review threads: ${resolveErrorMsg}`);
                // Continue with merge attempt even if thread check/resolution fails
              }
            }

            const mergeResult = await githubMergeService.mergePR(
              workDir,
              result.prNumber,
              mergeStrategy,
              waitForCI
            );

            if (mergeResult.success) {
              result.merged = true;
              result.mergeCommitSha = mergeResult.mergeCommitSha;
              result.prMergedAt = new Date().toISOString();
              this.trackOperation('merge', featureId, true);
              logger.info(
                `Successfully merged PR #${result.prNumber}${mergeResult.mergeCommitSha ? ` (commit: ${mergeResult.mergeCommitSha})` : ''}`
              );

              // Emit feature:pr-merged event for sync services
              if (events) {
                events.emit('feature:pr-merged', {
                  featureId,
                  projectPath,
                  prNumber: result.prNumber,
                  prUrl: result.prUrl,
                  mergeCommitSha: result.mergeCommitSha,
                });
                logger.debug(`Emitted feature:pr-merged event for feature ${featureId}`);
              }
            } else {
              result.merged = false;
              this.trackOperation('merge', featureId, false, mergeResult.error);
              logger.warn(`Failed to merge PR #${result.prNumber}: ${mergeResult.error}`);

              // Add merge error to result but don't fail the entire workflow
              const mergeError = `Merge failed: ${mergeResult.error}`;
              result.error = result.error ? `${result.error}; ${mergeError}` : mergeError;

              // Log specific reasons for merge failure
              if (mergeResult.checksPending) {
                logger.info('Merge skipped: CI checks still pending');
              } else if (mergeResult.checksFailed) {
                logger.warn(
                  `Merge blocked by failed checks: ${mergeResult.failedChecks?.join(', ')}`
                );
              }
            }
          } catch (mergeError) {
            const errorMsg = mergeError instanceof Error ? mergeError.message : String(mergeError);
            this.trackOperation('merge', featureId, false, errorMsg);
            logger.error(`Error during auto-merge for PR #${result.prNumber}: ${errorMsg}`);
            result.merged = false;
            result.error = result.error
              ? `${result.error}; Merge error: ${errorMsg}`
              : `Merge error: ${errorMsg}`;
          }
        }
      }

      this.activeWorkflows--;
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Git workflow failed for feature ${featureId}: ${errorMsg}`);
      result.error = errorMsg;
      this.activeWorkflows--;
      return result;
    }
  }

  /**
   * Calculate the number of lines changed and files touched in a PR diff.
   * Uses `git diff --numstat` against the remote base branch.
   *
   * @returns Object with linesChanged and filesTouched counts, or null on failure.
   */
  private async calculatePRDiffStats(
    workDir: string,
    prBaseBranch: string
  ): Promise<{ linesChanged: number; filesTouched: number } | null> {
    try {
      // Ensure we have up-to-date base branch info (non-fatal if fetch fails)
      await execAsync(`git fetch origin ${prBaseBranch}`, {
        cwd: workDir,
        env: execEnv,
        timeout: 30_000,
      }).catch(() => {
        // Non-fatal: fetch may fail if origin is unavailable; proceed with cached refs
      });

      const { stdout } = await execAsync(`git diff --numstat origin/${prBaseBranch}...HEAD`, {
        cwd: workDir,
        env: execEnv,
      });

      const lines = stdout.trim().split('\n').filter(Boolean);
      let linesChanged = 0;
      let filesTouched = 0;

      for (const line of lines) {
        filesTouched++;
        // numstat format: "{insertions}\t{deletions}\t{filename}"
        // Binary files show "-\t-\t{filename}" — skip for line count
        const parts = line.split('\t');
        if (parts.length >= 2 && parts[0] !== '-' && parts[1] !== '-') {
          linesChanged += parseInt(parts[0], 10) + parseInt(parts[1], 10);
        }
      }

      return { linesChanged, filesTouched };
    } catch (error) {
      logger.warn(
        `Failed to calculate PR diff stats: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Check if a PR exceeds size limits and flag it if so.
   * Adds an 'oversized-pr' label to the PR and creates an actionable item for human review.
   * Does NOT block the PR — purely advisory.
   */
  private async checkAndFlagOversizedPR(
    workDir: string,
    projectPath: string,
    feature: Feature,
    featureId: string,
    prNumber: number,
    prUrl: string | null,
    prBaseBranch: string,
    maxLinesChanged: number,
    maxFilesTouched: number
  ): Promise<void> {
    try {
      const stats = await this.calculatePRDiffStats(workDir, prBaseBranch);
      if (!stats) return;

      const { linesChanged, filesTouched } = stats;

      const linesExceeded = maxLinesChanged > 0 && linesChanged > maxLinesChanged;
      const filesExceeded = maxFilesTouched > 0 && filesTouched > maxFilesTouched;

      if (!linesExceeded && !filesExceeded) {
        logger.debug(
          `PR #${prNumber} size OK: ${linesChanged} lines changed, ${filesTouched} files touched`
        );
        return;
      }

      const reasons: string[] = [];
      if (linesExceeded) {
        reasons.push(`${linesChanged} lines changed (limit: ${maxLinesChanged})`);
      }
      if (filesExceeded) {
        reasons.push(`${filesTouched} files touched (limit: ${maxFilesTouched})`);
      }
      const reasonStr = reasons.join(', ');

      logger.warn(
        `[PRSizeCheck] PR #${prNumber} for feature ${featureId} is oversized: ${reasonStr}. ` +
          `Adding 'oversized-pr' label and creating actionable item.`
      );

      // Add 'oversized-pr' label to the PR (best-effort, non-blocking)
      try {
        await execFileAsync('gh', ['pr', 'edit', String(prNumber), '--add-label', 'oversized-pr'], {
          cwd: workDir,
          env: execEnv,
        });
        logger.info(`Added 'oversized-pr' label to PR #${prNumber}`);
      } catch (labelError) {
        logger.warn(
          `Failed to add 'oversized-pr' label to PR #${prNumber}: ${labelError instanceof Error ? labelError.message : String(labelError)}`
        );
      }

      // Create actionable item for human review (if service is wired)
      if (this.actionableItemService) {
        try {
          const title = feature.title || `Feature ${featureId}`;
          await this.actionableItemService.createActionableItem({
            projectPath,
            actionType: 'review',
            priority: 'high',
            title: `Oversized PR: ${title}`,
            message:
              `PR #${prNumber} exceeds size limits and requires human review. ` +
              `Reason: ${reasonStr}. ` +
              `Consider breaking this PR into smaller, more focused changes.` +
              (prUrl ? ` PR: ${prUrl}` : ''),
            category: 'pr-size',
            actionPayload: {
              featureId,
              prNumber,
              prUrl: prUrl ?? undefined,
              linesChanged,
              filesTouched,
              maxLinesChanged,
              maxFilesTouched,
            },
          });
          logger.info(`Created actionable item for oversized PR #${prNumber}`);
        } catch (actionableError) {
          logger.warn(
            `Failed to create actionable item for oversized PR #${prNumber}: ${actionableError instanceof Error ? actionableError.message : String(actionableError)}`
          );
        }
      }
    } catch (error) {
      // Never let size check errors propagate — purely advisory
      logger.warn(
        `[PRSizeCheck] Unexpected error checking PR size (non-fatal): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if PR has unresolved critical review threads.
   * Critical threads must be manually reviewed and block auto-merge.
   *
   * @param workDir - Working directory containing the repository
   * @param prNumber - PR number to check
   * @returns true if critical threads exist, false otherwise
   */
  private async checkForCriticalThreads(workDir: string, prNumber: number): Promise<boolean> {
    try {
      // Extract owner/repo from git remote
      const { stdout: remoteOutput } = await execAsync('git remote get-url origin', {
        cwd: workDir,
        env: execEnv,
      });

      const remoteUrl = remoteOutput.trim();
      const match =
        remoteUrl.match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/) ||
        remoteUrl.match(/^([^/]+)\/([^/\s]+)$/);

      if (!match) {
        logger.warn(`Could not parse GitHub owner/repo from remote: ${remoteUrl}`);
        return false;
      }

      const [, owner, repoName] = match;

      // Query review threads using GraphQL
      const query = `
        query {
          repository(owner: "${owner}", name: "${repoName}") {
            pullRequest(number: ${prNumber}) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 1) {
                    nodes {
                      body
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const { stdout } = await execAsync(`gh api graphql -f query='${query.replace(/\n/g, ' ')}'`, {
        cwd: workDir,
        env: execEnv,
      });

      const data = JSON.parse(stdout);
      const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

      // Check for unresolved threads with critical severity
      for (const thread of threads) {
        if (thread.isResolved) continue;

        const body = thread.comments?.nodes?.[0]?.body || '';
        const severity = this.parseSeverityFromBody(body);

        if (severity === 'critical') {
          logger.warn(`Found unresolved critical thread: ${thread.id}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error(`Failed to check for critical threads on PR #${prNumber}:`, error);
      // On error, don't block merge - assume no critical threads
      return false;
    }
  }

  /**
   * Parse severity from comment body (same logic as codeRabbitResolverService)
   */
  private parseSeverityFromBody(body: string): 'critical' | 'warning' | 'suggestion' | 'info' {
    const severityMatch = body.match(/\*\*Severity\*\*:\s*(\w+)/i);
    if (severityMatch) {
      const sev = severityMatch[1].toLowerCase();
      if (sev === 'critical' || sev === 'high') return 'critical';
      if (sev === 'warning' || sev === 'medium') return 'warning';
      if (sev === 'suggestion' || sev === 'low') return 'suggestion';
    }

    if (body.includes('🚨')) return 'critical';
    if (body.includes('⚠️')) return 'warning';
    if (body.includes('💡')) return 'suggestion';

    return 'info';
  }

  /**
   * Validate that GitHub Actions workflows are configured to trigger on the PR base branch.
   *
   * This is a purely advisory check that logs a warning when CI workflows exist but their
   * `branches:` filter does not mention `prBaseBranch`. If CI never triggers on that branch,
   * checks will remain "pending" indefinitely and features will time out in REVIEW state.
   *
   * Does NOT block PR creation — failures here are logged and swallowed.
   */
  private async validateCIWorkflowTriggers(
    projectPath: string,
    prBaseBranch: string
  ): Promise<void> {
    try {
      const workflowDir = path.join(projectPath, '.github', 'workflows');

      // List workflow files (non-fatal if the directory doesn't exist)
      let workflowFiles: string[] = [];
      try {
        const { stdout } = await execAsync(`ls "${workflowDir}"`, { env: execEnv });
        workflowFiles = stdout
          .trim()
          .split('\n')
          .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
      } catch {
        // No .github/workflows/ directory — nothing to validate
        return;
      }

      if (workflowFiles.length === 0) return;

      let anyWorkflowTriggersBranch = false;
      const misconfiguredFiles: string[] = [];

      for (const file of workflowFiles) {
        try {
          const filePath = path.join(workflowDir, file);
          const { stdout: content } = await execAsync(`cat "${filePath}"`, { env: execEnv });

          // Text-based check: does the file mention the base branch in a branches list?
          // Handles common YAML patterns: `- dev`, `"dev"`, `'dev'`
          const branchMentioned =
            content.includes(`- ${prBaseBranch}`) ||
            content.includes(`"${prBaseBranch}"`) ||
            content.includes(`'${prBaseBranch}'`);

          if (branchMentioned) {
            anyWorkflowTriggersBranch = true;
          } else if (content.includes('branches:')) {
            // Workflow has an explicit branches filter but doesn't mention prBaseBranch
            misconfiguredFiles.push(file);
          }
        } catch {
          // Ignore individual file read errors
        }
      }

      if (!anyWorkflowTriggersBranch && misconfiguredFiles.length > 0) {
        logger.warn(
          `[CI Validation] ⚠️  CI workflows may not trigger on branch '${prBaseBranch}'.\n` +
            `  Affected workflow files: ${misconfiguredFiles.join(', ')}\n` +
            `  This means CI checks will stay "pending" indefinitely on PRs targeting '${prBaseBranch}',\n` +
            `  causing features to time out in REVIEW state.\n` +
            `  Fix: add '- ${prBaseBranch}' to the 'branches:' list in each workflow's push/pull_request trigger.`
        );
      }
    } catch (err) {
      // Validation is advisory — never let it crash the workflow
      logger.debug(`[CI Validation] Skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Commit all changes in the working directory.
   * @returns Commit hash (short) if changes were committed, null if no changes
   */
  private async commitChanges(
    workDir: string,
    feature: Feature,
    projectPath: string
  ): Promise<string | null> {
    // Check for changes - include untracked files explicitly
    const { stdout: status } = await execAsync('git status --porcelain --untracked-files=all', {
      cwd: workDir,
      env: execEnv,
    });

    if (!status.trim()) {
      return null; // No changes
    }

    logger.debug(`Detected changes in ${workDir}:\n${status.trim()}`);

    // Generate commit message
    const title = feature.title || extractTitleFromDescription(feature.description);
    const commitMessage = `feat: ${title}\n\nImplemented by Automaker auto-mode\nFeature ID: ${feature.id}`;

    // Stage all changes - exclude .automaker/ except memory/ and skills/ (if they exist).
    await execAsync(buildGitAddCommand(workDir), { cwd: workDir, env: execEnv });

    // Auto-format staged files before committing (matches CI prettier behavior)
    try {
      const { stdout: stagedFiles } = await execAsync(
        "git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.css' '*.md'",
        { cwd: workDir, env: execEnv }
      );
      const files = stagedFiles.trim().split('\n').filter(Boolean);
      if (files.length > 0) {
        const prettierBin = path.join(projectPath, 'node_modules/.bin/prettier');
        await execAsync(
          `node "${prettierBin}" --ignore-path /dev/null --write ${files.map((f) => `"${f}"`).join(' ')}`,
          {
            cwd: workDir,
            env: execEnv,
          }
        );
        // Re-stage after formatting
        await execAsync(buildGitAddCommand(workDir), { cwd: workDir, env: execEnv });
        logger.debug(`Auto-formatted ${files.length} staged files`);
      }
    } catch (fmtError) {
      logger.warn(
        `Auto-format failed (non-fatal): ${fmtError instanceof Error ? fmtError.message : String(fmtError)}`
      );
    }

    // Auto-generate changeset from staged files
    try {
      await this.generateChangeset(workDir, feature, commitMessage);
    } catch (csError) {
      logger.warn(
        `Changeset generation failed (non-fatal): ${csError instanceof Error ? csError.message : String(csError)}`
      );
    }

    // Create commit (--no-verify bypasses commitlint hook; agents use auto-generated messages)
    // Use execFile to pass the commit message as an argument directly, avoiding shell
    // interpolation issues with newlines and special characters in the message.
    await execFileAsync('git', ['commit', '--no-verify', '-m', commitMessage], {
      cwd: workDir,
      env: execEnv,
    });

    // Get commit hash
    const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
      cwd: workDir,
      env: execEnv,
    });

    return hashOutput.trim().substring(0, 8);
  }

  /**
   * Auto-generate a changeset file from staged files before committing.
   * Maps touched directories to package names and creates a .changeset/*.md file.
   */
  private async generateChangeset(
    workDir: string,
    feature: Feature,
    commitMessage: string
  ): Promise<void> {
    // Get staged files
    const { stdout: stagedFiles } = await execAsync(
      'git diff --cached --name-only --diff-filter=ACMR',
      { cwd: workDir, env: execEnv }
    );

    const files = stagedFiles.trim().split('\n').filter(Boolean);
    if (files.length === 0) return;

    // Map directory prefixes to package names
    const DIR_TO_PACKAGE: Record<string, string> = {
      'libs/types/': '@protolabsai/types',
      'libs/utils/': '@protolabsai/utils',
      'libs/platform/': '@protolabsai/platform',
      'libs/prompts/': '@protolabsai/prompts',
      'libs/tools/': '@protolabsai/tools',
      'libs/model-resolver/': '@protolabsai/model-resolver',
      'libs/dependency-resolver/': '@protolabsai/dependency-resolver',
      'libs/spec-parser/': '@protolabsai/spec-parser',
      'libs/flows/': '@protolabsai/flows',
      'libs/observability/': '@protolabsai/observability',
      'libs/git-utils/': '@protolabsai/git-utils',
      'libs/ui/': '@protolabsai/ui',
    };

    // Detect which packages were touched
    const touchedPackages = new Set<string>();
    for (const file of files) {
      for (const [prefix, pkgName] of Object.entries(DIR_TO_PACKAGE)) {
        if (file.startsWith(prefix)) {
          touchedPackages.add(pkgName);
        }
      }
    }

    // Skip if no publishable packages were touched (e.g. only apps/ changes)
    if (touchedPackages.size === 0) return;

    // Extract summary from commit message (first line only)
    const summary = commitMessage
      .split('\n')[0]
      .replace(/^feat:\s*/i, '')
      .trim();

    // Generate changeset ID (matches changesets CLI format)
    const id = `auto-${feature.id.slice(-8)}-${Date.now().toString(36)}`;

    // Build changeset content
    const lines = ['---'];
    for (const pkg of touchedPackages) {
      lines.push(`'${pkg}': minor`);
    }
    lines.push('---');
    lines.push('');
    lines.push(summary);
    lines.push('');

    // Write changeset file
    const fs = await import('fs/promises');
    const path = await import('path');
    const changesetDir = path.join(workDir, '.changeset');

    // Ensure .changeset/ directory exists (it may not exist in worktrees)
    await fs.mkdir(changesetDir, { recursive: true });
    await fs.writeFile(path.join(changesetDir, `${id}.md`), lines.join('\n'));

    // Stage the changeset file
    await execAsync(`git add ".changeset/${id}.md"`, { cwd: workDir, env: execEnv });

    logger.info(
      `Auto-generated changeset ${id} for ${touchedPackages.size} package(s): ${[...touchedPackages].join(', ')}`
    );
  }

  /**
   * Check if the branch has commits that haven't been pushed to remote.
   * Handles the case where the branch doesn't exist on remote yet.
   * @returns HEAD short hash if unpushed commits exist, null otherwise
   */
  private async getUnpushedCommitHash(workDir: string, branchName: string): Promise<string | null> {
    try {
      // Check if the branch exists on remote
      const { stdout: remoteRef } = await execAsync(`git ls-remote --heads origin ${branchName}`, {
        cwd: workDir,
        env: execEnv,
      });

      if (!remoteRef.trim()) {
        // Branch doesn't exist on remote — any local commits are unpushed
        const { stdout: localHead } = await execAsync('git rev-parse --short HEAD', {
          cwd: workDir,
          env: execEnv,
        });
        const hash = localHead.trim();
        // Verify there actually are commits on this branch (not just the base)
        const { stdout: commitCount } = await execAsync(
          `git rev-list --count origin/main..HEAD 2>/dev/null || echo "0"`,
          { cwd: workDir, env: execEnv }
        );
        return parseInt(commitCount.trim(), 10) > 0 ? hash : null;
      }

      // Branch exists on remote — check for unpushed commits
      const { stdout: unpushed } = await execAsync(
        `git rev-list origin/${branchName}..HEAD --count`,
        { cwd: workDir, env: execEnv }
      );

      if (parseInt(unpushed.trim(), 10) > 0) {
        const { stdout: head } = await execAsync('git rev-parse --short HEAD', {
          cwd: workDir,
          env: execEnv,
        });
        return head.trim();
      }

      return null;
    } catch {
      // If anything fails (no remote, etc.), check for local commits vs main
      try {
        const { stdout: ahead } = await execAsync('git rev-list origin/main..HEAD --count', {
          cwd: workDir,
          env: execEnv,
        });
        if (parseInt(ahead.trim(), 10) > 0) {
          const { stdout: head } = await execAsync('git rev-parse --short HEAD', {
            cwd: workDir,
            env: execEnv,
          });
          return head.trim();
        }
      } catch {
        // Truly nothing to do
      }
      return null;
    }
  }

  /**
   * Run prettier on all changed files and amend the last commit.
   * Used when the agent committed without formatting.
   */
  private async formatAndAmendLastCommit(workDir: string, projectPath: string): Promise<void> {
    try {
      // Get files changed in the last commit
      const { stdout: changedFiles } = await execAsync(
        "git diff --name-only HEAD~1..HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.css' '*.md'",
        { cwd: workDir, env: execEnv }
      );
      const files = changedFiles.trim().split('\n').filter(Boolean);
      if (files.length === 0) return;

      // Format them using the workspace Prettier binary (worktrees have no node_modules)
      const prettierBin = path.join(projectPath, 'node_modules/.bin/prettier');
      await execAsync(
        `node "${prettierBin}" --ignore-path /dev/null --write ${files.map((f) => `"${f}"`).join(' ')}`,
        { cwd: workDir, env: execEnv }
      );

      // Check if formatting actually changed anything
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: workDir,
        env: execEnv,
      });
      if (!status.trim()) return; // No formatting changes needed

      // Stage and amend
      await execAsync(buildGitAddCommand(workDir), { cwd: workDir, env: execEnv });
      await execAsync('git commit --no-verify --amend --no-edit', { cwd: workDir, env: execEnv });
      logger.info(`Formatted and amended last commit (${files.length} files checked)`);
    } catch (error) {
      logger.warn(
        `Format-and-amend failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if the remote branch exists and is ahead of the base branch.
   * Returns the short HEAD SHA of the remote branch if it has commits the base doesn't, null otherwise.
   * Used to detect the "agent committed AND pushed" case before git-workflow runs.
   */
  private async getRemoteAheadCommitHash(
    workDir: string,
    branchName: string,
    prBaseBranch: string
  ): Promise<string | null> {
    try {
      await execAsync(`git fetch origin ${branchName} ${prBaseBranch}`, {
        cwd: workDir,
        env: execEnv,
        timeout: 30_000,
      });
      const { stdout: countStr } = await execAsync(
        `git rev-list --count origin/${prBaseBranch}..origin/${branchName}`,
        { cwd: workDir, env: execEnv }
      );
      if (parseInt(countStr.trim(), 10) <= 0) return null;
      const { stdout: sha } = await execAsync(`git rev-parse --short origin/${branchName}`, {
        cwd: workDir,
        env: execEnv,
      });
      return sha.trim();
    } catch {
      return null;
    }
  }

  /**
   * Format all files changed in the PR diff and push a new format-fix commit.
   * Used when the agent already committed AND pushed without running prettier.
   * Cannot amend (commits are on the remote), so we add a new commit and push normally.
   */
  private async formatAndPushAlreadyPushedBranch(
    workDir: string,
    branchName: string,
    prBaseBranch: string,
    projectPath: string
  ): Promise<void> {
    try {
      // Make sure local branch tracks the remote commits
      await execAsync(`git fetch origin ${branchName}`, {
        cwd: workDir,
        env: execEnv,
        timeout: 30_000,
      });
      await execAsync(`git reset --hard origin/${branchName}`, { cwd: workDir, env: execEnv });

      // Get all files touched across the entire PR diff (all commits, not just the last one)
      const { stdout: changedFiles } = await execAsync(
        `git diff --name-only origin/${prBaseBranch}..HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.css' '*.md'`,
        { cwd: workDir, env: execEnv }
      );
      const files = changedFiles.trim().split('\n').filter(Boolean);
      if (files.length === 0) {
        logger.info('No formattable files in PR diff — skipping format-fix commit');
        return;
      }

      // Format using the workspace Prettier binary (worktrees have no node_modules)
      const prettierBin = path.join(projectPath, 'node_modules/.bin/prettier');
      await execAsync(
        `node "${prettierBin}" --ignore-path /dev/null --write ${files.map((f) => `"${f}"`).join(' ')}`,
        { cwd: workDir, env: execEnv }
      );

      // Only commit if formatting actually changed anything
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: workDir,
        env: execEnv,
      });
      if (!status.trim()) {
        logger.info('PR diff already formatted — no format-fix commit needed');
        return;
      }

      // Stage and push a new commit (cannot amend — already on remote)
      await execAsync(buildGitAddCommand(workDir), { cwd: workDir, env: execEnv });
      await execAsync('git commit --no-verify -m "fix(format): prettier on agent-created files"', {
        cwd: workDir,
        env: execEnv,
      });
      await execAsync(`git push origin ${branchName}`, {
        cwd: workDir,
        env: execEnv,
        timeout: 60_000,
      });
      logger.info(`Format-fix commit pushed for branch ${branchName} (${files.length} files)`);
    } catch (error) {
      logger.warn(
        `Format-and-push failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Push the current branch to remote.
   * Uses exponential backoff retry (3 attempts with 2s/4s/8s delays).
   * @returns true if push succeeded
   */
  private async pushToRemote(
    workDir: string,
    branchName: string,
    forceWithLease: boolean = false
  ): Promise<boolean> {
    const forceFlag = forceWithLease ? ' --force-with-lease' : '';
    return await retryWithExponentialBackoff(async () => {
      try {
        await execAsync(`git push${forceFlag} -u origin ${branchName}`, {
          cwd: workDir,
          env: execEnv,
        });
        return true;
      } catch {
        // Try with --set-upstream
        await execAsync(`git push${forceFlag} --set-upstream origin ${branchName}`, {
          cwd: workDir,
          env: execEnv,
        });
        return true;
      }
    }, `Push branch ${branchName}`);
  }

  /**
   * Create a pull request using gh CLI.
   * @returns PR URL and number if created/found
   */
  private async createPullRequest(
    workDir: string,
    projectPath: string,
    feature: Feature,
    branchName: string,
    baseBranch: string,
    instanceId?: string,
    teamId?: string
  ): Promise<{
    prUrl: string | null;
    prNumber?: number;
    prAlreadyExisted?: boolean;
    prCreatedAt?: string;
  }> {
    // Check if gh CLI is available
    const ghAvailable = await isGhCliAvailable();
    if (!ghAvailable) {
      logger.debug('gh CLI not available, skipping PR creation');
      return { prUrl: null };
    }

    const title = feature.title || extractTitleFromDescription(feature.description);
    let body = buildPRBody(feature);

    // Always append ownership watermark so the PR Maintainer crew never silently skips managed PRs.
    // If instanceId was not configured, generate a transient fallback and warn.
    const effectiveInstanceId = instanceId || `transient-${randomUUID().slice(0, 8)}`;
    if (!instanceId) {
      logger.warn(
        `[GitWorkflow] No instanceId in settings — using transient ID "${effectiveInstanceId}" for PR watermark. ` +
          'Configure instanceId in global settings to ensure consistent PR ownership tracking.'
      );
    }
    body = `${body}\n\n${buildPROwnershipWatermark(effectiveInstanceId, teamId ?? '')}`;
    logger.debug(
      `[GitWorkflow] Appended ownership watermark to PR body (instance=${effectiveInstanceId})`
    );

    // Detect repository info by checking remotes
    // We need to explicitly set --repo to avoid gh defaulting to wrong upstream
    let upstreamRepo: string | null = null;
    let originRepo: string | null = null;

    try {
      const { stdout: remotes } = await execAsync('git remote -v', {
        cwd: workDir,
        env: execEnv,
      });

      const lines = remotes.split(/\r?\n/);
      for (const line of lines) {
        let match = line.match(/^(\w+)\s+.*[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\s+\(fetch\)/);
        if (!match) {
          match = line.match(/^(\w+)\s+git@[^:]+:([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);
        }
        if (!match) {
          match = line.match(/^(\w+)\s+https?:\/\/[^/]+\/([^/]+)\/([^\s]+?)(?:\.git)?\s+\(fetch\)/);
        }

        if (match) {
          const [, remoteName, owner, repoName] = match;
          if (remoteName === 'upstream') {
            upstreamRepo = `${owner}/${repoName}`;
          } else if (remoteName === 'origin') {
            originRepo = `${owner}/${repoName}`;
          }
        }
      }
    } catch {
      // Couldn't parse remotes
    }

    // Determine target repo: use origin (the fork) for auto-mode PRs
    // This keeps PRs within your fork rather than targeting upstream
    // Always use explicit --repo to avoid gh CLI defaulting to wrong repo
    const targetRepo = originRepo || upstreamRepo;
    const headRef = branchName; // No cross-fork PR - target our own repo
    const repoArg = targetRepo ? ` --repo "${targetRepo}"` : '';

    // Validate CI workflow triggers before creating/returning PR.
    // Logs a warning (non-blocking) if CI workflows don't include the base branch —
    // which would cause checks to stay "pending" indefinitely on the new PR.
    await this.validateCIWorkflowTriggers(projectPath, baseBranch);

    try {
      const listCmd = `gh pr list${repoArg} --head "${headRef}" --json number,title,url,state --limit 1`;
      const { stdout: existingPrOutput } = await execAsync(listCmd, {
        cwd: workDir,
        env: execEnv,
      });

      const existingPrs = JSON.parse(existingPrOutput);
      if (Array.isArray(existingPrs) && existingPrs.length > 0) {
        const existingPr = existingPrs[0];

        // Store PR info in metadata
        await updateWorktreePRInfo(projectPath, branchName, {
          number: existingPr.number,
          url: existingPr.url,
          title: existingPr.title || title,
          state: validatePRState(existingPr.state),
          createdAt: new Date().toISOString(),
        });

        return {
          prUrl: existingPr.url,
          prNumber: existingPr.number,
          prAlreadyExisted: true,
        };
      }
    } catch {
      // No existing PR found, continue to create
    }

    // Create new PR - use execFileAsync array args to avoid shell injection
    // with backticks, $(), !, and other special chars in LLM-generated PR bodies
    const prArgs = [
      'pr',
      'create',
      '--base',
      baseBranch,
      '--head',
      branchName,
      '--title',
      title,
      '--body',
      body,
    ];

    if (targetRepo) {
      prArgs.push('--repo', targetRepo);
    }

    try {
      // Use retry logic for PR creation
      const { prUrl, prNumber, prCreatedAt } = await retryWithExponentialBackoff(async () => {
        const { stdout: prOutput } = await execFileAsync('gh', prArgs, {
          cwd: workDir,
          env: execEnv,
        });
        const prUrl = prOutput.trim();

        // Extract PR number
        let prNumber: number | undefined;
        const prCreatedAt = new Date().toISOString();
        const prMatch = prUrl.match(/\/pull\/(\d+)/);
        if (prMatch) {
          prNumber = parseInt(prMatch[1], 10);
        }

        return { prUrl, prNumber, prCreatedAt };
      }, `Create PR for ${branchName}`);

      // Store metadata after successful creation
      if (prNumber) {
        await updateWorktreePRInfo(projectPath, branchName, {
          number: prNumber,
          url: prUrl,
          title,
          state: 'OPEN',
          createdAt: prCreatedAt,
        });

        // Enable auto-merge so PRs don't sit BLOCKED waiting for manual intervention
        try {
          await execFileAsync('gh', ['pr', 'merge', String(prNumber), '--auto', '--squash'], {
            cwd: workDir,
            env: execEnv,
          });
          logger.info(`Auto-merge enabled on PR #${prNumber}`);
        } catch (autoMergeError) {
          logger.warn(`Failed to enable auto-merge on PR #${prNumber}:`, autoMergeError);
        }
      }

      return { prUrl, prNumber, prAlreadyExisted: false, prCreatedAt };
    } catch (error) {
      // Check if error indicates PR already exists
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('already exists')) {
        // Try to fetch existing PR
        try {
          const { stdout: viewOutput } = await execAsync(
            `gh pr view --json number,title,url,state`,
            { cwd: workDir, env: execEnv }
          );
          const existingPr = JSON.parse(viewOutput);
          if (existingPr.url) {
            await updateWorktreePRInfo(projectPath, branchName, {
              number: existingPr.number,
              url: existingPr.url,
              title: existingPr.title || title,
              state: validatePRState(existingPr.state),
              createdAt: new Date().toISOString(),
            });
            return {
              prUrl: existingPr.url,
              prNumber: existingPr.number,
              prAlreadyExisted: true,
            };
          }
        } catch {
          // Fall through to throw
        }
      }
      throw error;
    }
  }
}

// Export singleton instance
export const gitWorkflowService = new GitWorkflowService();
