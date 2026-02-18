/**
 * Git Workflow Service - Automated git operations after feature completion
 *
 * Handles automatic commit, push, and PR creation when agents successfully
 * complete features in auto-mode.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';
import type {
  Feature,
  GitWorkflowSettings,
  GitWorkflowResult,
  GlobalSettings,
  GraphiteSettings,
} from '@automaker/types';
import { DEFAULT_GIT_WORKFLOW_SETTINGS, DEFAULT_GRAPHITE_SETTINGS } from '@automaker/types';
import { updateWorktreePRInfo } from '../lib/worktree-metadata.js';
import { validatePRState } from '@automaker/types';
import { graphiteService } from './graphite-service.js';
import { githubMergeService } from './github-merge-service.js';
import { codeRabbitResolverService } from './coderabbit-resolver-service.js';
import type { EventEmitter } from '../lib/events.js';

const execAsync = promisify(exec);
const logger = createLogger('GitWorkflow');

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
};

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
            logger.info(`Pushed branch ${branchName} to remote`);
          }
        } catch (pushError) {
          const errorMsg = pushError instanceof Error ? pushError.message : String(pushError);
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
              logger.info(`PR ${result.prAlreadyExisted ? 'exists' : 'created'}: ${result.prUrl}`);
            }
          } catch (prError) {
            const errorMsg = prError instanceof Error ? prError.message : String(prError);
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
            logger.error(`Error during auto-merge for PR #${result.prNumber}: ${errorMsg}`);
            result.merged = false;
            result.error = result.error
              ? `${result.error}; Merge error: ${errorMsg}`
              : `Merge error: ${errorMsg}`;
          }
        }
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Git workflow failed for feature ${featureId}: ${errorMsg}`);
      result.error = errorMsg;
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
    const body = `## Summary\n\n${feature.description.substring(0, 500)}${feature.description.length > 500 ? '...' : ''}\n\n---\n*Created automatically by Automaker*`;

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

    // Create commit
    await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
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
      await execAsync('git commit --amend --no-edit', { cwd: workDir, env: execEnv });
      logger.info(`Formatted and amended last commit (${files.length} files checked)`);
    } catch (error) {
      logger.warn(
        `Format-and-amend failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Push the current branch to remote.
   * @returns true if push succeeded
   */
  private async pushToRemote(workDir: string, branchName: string): Promise<boolean> {
    try {
      await execAsync(`git push -u origin ${branchName}`, {
        cwd: workDir,
        env: execEnv,
      });
      return true;
    } catch {
      // Try with --set-upstream
      try {
        await execAsync(`git push --set-upstream origin ${branchName}`, {
          cwd: workDir,
          env: execEnv,
        });
        return true;
      } catch (error) {
        throw error;
      }
    }
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
    const body = `## Summary\n\n${feature.description.substring(0, 500)}${feature.description.length > 500 ? '...' : ''}\n\n---\n*Created automatically by Automaker*`;

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
      const { stdout: prOutput } = await execAsync(prCmd, {
        cwd: workDir,
        env: execEnv,
      });
      const prUrl = prOutput.trim();

      // Extract PR number and store metadata
      let prNumber: number | undefined;
      const prCreatedAt = new Date().toISOString();
      const prMatch = prUrl.match(/\/pull\/(\d+)/);
      if (prMatch) {
        prNumber = parseInt(prMatch[1], 10);

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
