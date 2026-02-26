/**
 * Git Workflow Service - Automated git operations after feature completion
 *
 * Handles automatic commit, push, and PR creation when agents successfully
 * complete features in auto-mode.
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';
import type {
  Feature,
  GitWorkflowSettings,
  GitWorkflowResult,
  GlobalSettings,
} from '@protolabs-ai/types';
import { DEFAULT_GIT_WORKFLOW_SETTINGS, DEFAULT_GRAPHITE_SETTINGS } from '@protolabs-ai/types';
import { updateWorktreePRInfo } from '../lib/worktree-metadata.js';
import { validatePRState } from '@protolabs-ai/types';
import { graphiteService } from './graphite-service.js';
import { githubMergeService } from './github-merge-service.js';
import { codeRabbitResolverService } from './coderabbit-resolver-service.js';
import type { EventEmitter } from '../lib/events.js';

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

// Extended PATH for finding git and gh CLI (same as worktree routes)
const pathSeparator = process.platform === 'win32' ? ';' : ':';
const additionalPaths: string[] = [];

if (process.platform === 'win32') {
  if (process.env.LOCALAPPDATA) {
    additionalPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`);
  }
  if (process.env.PROGRAMFILES) {
    additionalPaths.push(`${process.env.PROGRAMFILES}\\Git\\cmd`);
  }
  if (process.env['ProgramFiles(x86)']) {
    additionalPaths.push(`${process.env['ProgramFiles(x86)']}\\Git\\cmd`);
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

const execEnv = {
  ...process.env,
  PATH: extendedPath,
  HUSKY: '0', // Disable husky hooks in worktrees — agents handle formatting themselves
};

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

/**
 * Extract a clean title from feature description for commit message
 */
function extractTitleFromDescription(description: string): string {
  // Take first line, remove markdown formatting
  const firstLine = description.split('\n')[0].trim();
  const cleaned = firstLine
    .replace(/^#+\s*/, '') // Remove markdown headers
    .replace(/\*\*/g, '') // Remove bold
    .replace(/\*/g, '') // Remove italic
    .replace(/`/g, '') // Remove code marks
    .trim();

  // Limit length
  if (cleaned.length > 72) {
    return cleaned.substring(0, 69) + '...';
  }
  return cleaned || 'Feature implementation';
}

export class GitWorkflowService {
  private activeWorkflows = 0;
  private recentOperations: RecentOperation[] = [];
  private readonly MAX_RECENT_OPERATIONS = 10;

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
      prBaseBranch: global.prBaseBranch ?? DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch,
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
    branchName: string
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

      // Stage all changes (same pattern as commitChanges)
      await execAsync("git add -A -- ':!.automaker/' '.automaker/memory/'", {
        cwd: workDir,
        env: execEnv,
      });

      // Format staged files before committing
      try {
        const { stdout: stagedFiles } = await execAsync(
          "git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.css' '*.md'",
          { cwd: workDir, env: execEnv }
        );
        const files = stagedFiles.trim().split('\n').filter(Boolean);
        if (files.length > 0) {
          await execAsync(
            `npx prettier --ignore-path /dev/null --write ${files.map((f) => `"${f}"`).join(' ')}`,
            { cwd: workDir, env: execEnv }
          );
          await execAsync("git add -A -- ':!.automaker/' '.automaker/memory/'", {
            cwd: workDir,
            env: execEnv,
          });
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
   * When Graphite is enabled and available, uses Graphite CLI for stack-aware
   * commit/push/PR operations. Otherwise falls back to git/gh CLI.
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
    const graphiteSettings = settings.graphite ?? DEFAULT_GRAPHITE_SETTINGS;

    // Determine PR base branch:
    // - If feature belongs to an epic and epicBranchName is provided, use it
    // - If feature is an epic itself, use the default base (main)
    // - Otherwise use the default base from settings
    const prBaseBranch =
      epicBranchName && !feature.isEpic ? epicBranchName : gitSettings.prBaseBranch;

    // Check if we should use Graphite for this workflow
    const useGraphite = await graphiteService.shouldUseGraphite(graphiteSettings);
    if (useGraphite) {
      logger.debug(`Using Graphite CLI for git workflow (feature ${featureId})`);
    }

    logger.debug(
      `Git workflow for ${featureId}: isEpic=${feature.isEpic}, epicId=${feature.epicId}, base=${prBaseBranch}, graphite=${useGraphite}`
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
      if (useGraphite && graphiteSettings.useGraphiteCommit) {
        // Use Graphite commit (updates stack metadata)
        const title = feature.title || extractTitleFromDescription(feature.description);
        const commitMessage = `feat: ${title}\n\nImplemented by Automaker auto-mode\nFeature ID: ${feature.id}`;
        commitHash = await graphiteService.commit(workDir, commitMessage);
      } else {
        // Use standard git commit
        commitHash = await this.commitChanges(workDir, feature);
      }

      if (!commitHash) {
        // Agent may have already committed. Check for unpushed commits before bailing out.
        const unpushedHash = await this.getUnpushedCommitHash(workDir, branchName);
        if (!unpushedHash) {
          logger.info(`No changes to commit and no unpushed commits for feature ${featureId}`);
          this.activeWorkflows--;
          return null;
        }
        // Agent pre-committed — format and amend, then continue pipeline
        logger.info(
          `No uncommitted changes but found unpushed commits for feature ${featureId}, continuing pipeline`
        );
        await this.formatAndAmendLastCommit(workDir);
        commitHash = unpushedHash;
      }
      result.commitHash = commitHash;
      this.trackOperation('commit', featureId, true);
      logger.info(`Committed changes for feature ${featureId}: ${commitHash}`);

      // Step 1.5: Restack with Graphite before pushing (if enabled)
      // This ensures the branch is up to date with trunk/main to prevent merge conflicts
      if (useGraphite && gitSettings.autoPush) {
        try {
          logger.info(`Restacking branch ${branchName} before push`);
          const restackResult = await graphiteService.restack(workDir);

          if (restackResult.conflicts) {
            logger.warn(`Restack encountered conflicts for branch ${branchName}`);
            result.error = 'Restack conflicts detected - manual resolution required';
            // Don't proceed with push/PR if conflicts exist
            return result;
          }

          if (!restackResult.success) {
            logger.warn(`Restack failed for branch ${branchName}: ${restackResult.error}`);
            // Log but continue - non-conflict failures shouldn't block PR creation
          } else {
            logger.info(`Successfully restacked branch ${branchName}`);
          }
        } catch (restackError) {
          const errorMsg =
            restackError instanceof Error ? restackError.message : String(restackError);
          logger.warn(`Error during restack for branch ${branchName}: ${errorMsg}`);
          // Log but continue - restack errors shouldn't block PR creation
        }
      }

      // Step 2: Push to remote (if enabled)
      if (gitSettings.autoPush) {
        try {
          let pushed: boolean;
          if (useGraphite) {
            // Graphite push handles force-push-with-lease for rebased stacks
            pushed = await graphiteService.push(workDir);
          } else {
            pushed = await this.pushToRemote(workDir, branchName);
          }
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

        // Step 3: Sync and restack (if using Graphite and PR creation enabled)
        if (result.pushed && gitSettings.autoCreatePR && useGraphite) {
          try {
            logger.info(`Syncing and restacking branch ${branchName} before PR creation`);
            const syncResult = await graphiteService.syncAndRestack(workDir);

            if (!syncResult.success) {
              if (syncResult.conflicts) {
                // Conflicts detected - this requires manual intervention
                const conflictError = `Branch ${branchName} has merge conflicts after sync. Manual resolution required.`;
                logger.error(conflictError);
                result.error = result.error ? `${result.error}; ${conflictError}` : conflictError;
                // Don't proceed with PR creation if there are conflicts
                return result;
              } else if (syncResult.error?.includes('circuit breaker is open')) {
                // Circuit breaker is open - fall back to gh CLI for PR creation
                logger.warn(
                  `Graphite circuit breaker is open, falling back to gh CLI for PR creation`
                );
                // Continue with PR creation using gh CLI fallback below
              } else {
                // Sync failed for another reason - log but continue
                logger.warn(`Sync failed but no conflicts detected: ${syncResult.error}`);
              }
            } else {
              logger.info(`Branch ${branchName} synced and restacked successfully`);
              // After successful rebase, push the rebased branch
              try {
                const rebased = await graphiteService.push(workDir);
                if (!rebased) {
                  logger.warn(`Failed to push rebased branch ${branchName}`);
                }
              } catch (pushError) {
                logger.warn(
                  `Failed to push rebased branch: ${pushError instanceof Error ? pushError.message : String(pushError)}`
                );
              }
            }
          } catch (syncError) {
            const errorMsg = syncError instanceof Error ? syncError.message : String(syncError);
            // Check if circuit breaker is open
            if (errorMsg.includes('circuit breaker is open')) {
              logger.warn(
                `Graphite circuit breaker is open, falling back to gh CLI for PR creation`
              );
              // Continue with PR creation using gh CLI fallback below
            } else {
              logger.warn(`Sync and restack failed for branch ${branchName}: ${errorMsg}`);
              // Log the error but continue with PR creation - sync is best-effort
            }
          }
        }

        // Step 4: Create PR (if push succeeded and PR creation enabled)
        if (result.pushed && gitSettings.autoCreatePR) {
          try {
            if (useGraphite) {
              // Try Graphite submit first - it handles base branch automatically via stack parent
              try {
                const prResult = await this.createPullRequestWithGraphite(
                  workDir,
                  projectPath,
                  feature,
                  branchName
                );
                result.prUrl = prResult.prUrl;
                result.prNumber = prResult.prNumber;
                result.prAlreadyExisted = prResult.prAlreadyExisted;
              } catch (graphiteError) {
                const graphiteErrorMsg =
                  graphiteError instanceof Error ? graphiteError.message : String(graphiteError);

                // Check if circuit breaker is open - fall back to gh CLI
                if (graphiteErrorMsg.includes('circuit breaker is open')) {
                  logger.warn(
                    `Graphite circuit breaker is open, falling back to gh CLI for PR creation`
                  );
                  const prResult = await this.createPullRequest(
                    workDir,
                    projectPath,
                    feature,
                    branchName,
                    prBaseBranch
                  );
                  result.prUrl = prResult.prUrl;
                  result.prNumber = prResult.prNumber;
                  result.prAlreadyExisted = prResult.prAlreadyExisted;
                } else {
                  // Other Graphite error - rethrow
                  throw graphiteError;
                }
              }
            } else {
              // Use gh CLI
              const prResult = await this.createPullRequest(
                workDir,
                projectPath,
                feature,
                branchName,
                prBaseBranch
              );
              result.prUrl = prResult.prUrl;
              result.prNumber = prResult.prNumber;
              result.prAlreadyExisted = prResult.prAlreadyExisted;
            }
            if (result.prUrl) {
              this.trackOperation('pr_create', featureId, true);
              logger.info(`PR ${result.prAlreadyExisted ? 'exists' : 'created'}: ${result.prUrl}`);
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
   * Create a pull request using Graphite CLI.
   * Graphite automatically determines the base branch from the stack parent.
   */
  private async createPullRequestWithGraphite(
    workDir: string,
    projectPath: string,
    feature: Feature,
    branchName: string
  ): Promise<{
    prUrl: string | null;
    prNumber?: number;
    prAlreadyExisted?: boolean;
    prCreatedAt?: string;
  }> {
    const title = feature.title || extractTitleFromDescription(feature.description);
    const body = buildPRBody(feature);

    const submitResult = await graphiteService.submit(workDir, title, body);

    if (submitResult.success && submitResult.prUrl) {
      const prCreatedAt = new Date().toISOString();

      // Store PR info in metadata
      await updateWorktreePRInfo(projectPath, branchName, {
        number: submitResult.prNumber!,
        url: submitResult.prUrl,
        title,
        state: 'OPEN',
        createdAt: prCreatedAt,
      });

      return {
        prUrl: submitResult.prUrl,
        prNumber: submitResult.prNumber,
        prAlreadyExisted: false, // Graphite submit handles existing PRs internally
        prCreatedAt,
      };
    }

    // If Graphite submit failed, fall back to checking for existing PR
    if (submitResult.error) {
      logger.warn(`Graphite submit failed: ${submitResult.error}, checking for existing PR`);
      const prInfo = await graphiteService.getPRInfo(workDir);
      if (prInfo?.prUrl) {
        await updateWorktreePRInfo(projectPath, branchName, {
          number: prInfo.prNumber!,
          url: prInfo.prUrl,
          title,
          state: 'OPEN',
          createdAt: new Date().toISOString(),
        });
        return {
          prUrl: prInfo.prUrl,
          prNumber: prInfo.prNumber,
          prAlreadyExisted: true,
        };
      }
    }

    return { prUrl: null };
  }

  /**
   * Commit all changes in the working directory.
   * @returns Commit hash (short) if changes were committed, null if no changes
   */
  private async commitChanges(workDir: string, feature: Feature): Promise<string | null> {
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

    // Stage all changes - include .automaker/memory/ but exclude other .automaker/ files
    await execAsync("git add -A -- ':!.automaker/' '.automaker/memory/'", {
      cwd: workDir,
      env: execEnv,
    });

    // Auto-format staged files before committing (matches CI prettier behavior)
    try {
      const { stdout: stagedFiles } = await execAsync(
        "git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.css' '*.md'",
        { cwd: workDir, env: execEnv }
      );
      const files = stagedFiles.trim().split('\n').filter(Boolean);
      if (files.length > 0) {
        await execAsync(
          `npx prettier --ignore-path .prettierignore --write ${files.map((f) => `"${f}"`).join(' ')}`,
          {
            cwd: workDir,
            env: execEnv,
          }
        );
        // Re-stage after formatting
        await execAsync("git add -A -- ':!.automaker/' '.automaker/memory/'", {
          cwd: workDir,
          env: execEnv,
        });
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
      'libs/types/': '@protolabs-ai/types',
      'libs/utils/': '@protolabs-ai/utils',
      'libs/platform/': '@protolabs-ai/platform',
      'libs/prompts/': '@protolabs-ai/prompts',
      'libs/tools/': '@protolabs-ai/tools',
      'libs/model-resolver/': '@protolabs-ai/model-resolver',
      'libs/dependency-resolver/': '@protolabs-ai/dependency-resolver',
      'libs/spec-parser/': '@protolabs-ai/spec-parser',
      'libs/flows/': '@protolabs-ai/flows',
      'libs/llm-providers/': '@protolabs-ai/llm-providers',
      'libs/observability/': '@protolabs-ai/observability',
      'libs/git-utils/': '@protolabs-ai/git-utils',
      'libs/ui/': '@protolabs-ai/ui',
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
  private async formatAndAmendLastCommit(workDir: string): Promise<void> {
    try {
      // Get files changed in the last commit
      const { stdout: changedFiles } = await execAsync(
        "git diff --name-only HEAD~1..HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.json' '*.css' '*.md'",
        { cwd: workDir, env: execEnv }
      );
      const files = changedFiles.trim().split('\n').filter(Boolean);
      if (files.length === 0) return;

      // Format them
      await execAsync(
        `npx prettier --ignore-path .prettierignore --write ${files.map((f) => `"${f}"`).join(' ')}`,
        { cwd: workDir, env: execEnv }
      );

      // Check if formatting actually changed anything
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: workDir,
        env: execEnv,
      });
      if (!status.trim()) return; // No formatting changes needed

      // Stage and amend
      await execAsync("git add -A -- ':!.automaker/' '.automaker/memory/'", {
        cwd: workDir,
        env: execEnv,
      });
      await execAsync('git commit --no-verify --amend --no-edit', { cwd: workDir, env: execEnv });
      logger.info(`Formatted and amended last commit (${files.length} files checked)`);
    } catch (error) {
      logger.warn(
        `Format-and-amend failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Push the current branch to remote.
   * Uses exponential backoff retry (3 attempts with 2s/4s/8s delays).
   * @returns true if push succeeded
   */
  private async pushToRemote(workDir: string, branchName: string): Promise<boolean> {
    return await retryWithExponentialBackoff(async () => {
      try {
        await execAsync(`git push -u origin ${branchName}`, {
          cwd: workDir,
          env: execEnv,
        });
        return true;
      } catch {
        // Try with --set-upstream
        await execAsync(`git push --set-upstream origin ${branchName}`, {
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
    baseBranch: string
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
    const body = buildPRBody(feature);

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

    // Create new PR - always use explicit --repo to target correct repository
    let prCmd = `gh pr create --base "${baseBranch}"`;

    if (targetRepo) {
      prCmd += ` --repo "${targetRepo}"`;
    }

    // Use simple branch name since we're targeting our own repo (origin)
    prCmd += ` --head "${branchName}"`;
    prCmd += ` --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`;

    try {
      // Use retry logic for PR creation
      const { prUrl, prNumber, prCreatedAt } = await retryWithExponentialBackoff(async () => {
        const { stdout: prOutput } = await execAsync(prCmd, {
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
