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
} from '@automaker/types';
import { DEFAULT_GIT_WORKFLOW_SETTINGS } from '@automaker/types';
import { updateWorktreePRInfo } from '../lib/worktree-metadata.js';
import { validatePRState } from '@automaker/types';

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
      prBaseBranch: global.prBaseBranch ?? DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch,
    };
  }

  /**
   * Run the complete git workflow after feature completion.
   * Operations are best-effort: failures in later steps don't prevent earlier steps from succeeding.
   *
   * @param projectPath - Absolute path to the main project (for storing PR metadata)
   * @param featureId - The feature ID
   * @param feature - The feature object
   * @param workDir - Working directory (worktree path or project path)
   * @param settings - Global settings containing git workflow config
   * @param epicBranchName - Optional epic branch name to use as PR base (for features in epics)
   * @returns GitWorkflowResult with details of what was done, or null if no workflow needed
   */
  async runPostCompletionWorkflow(
    projectPath: string,
    featureId: string,
    feature: Feature,
    workDir: string,
    settings: GlobalSettings,
    epicBranchName?: string
  ): Promise<GitWorkflowResult | null> {
    const gitSettings = this.resolveGitWorkflowSettings(feature, settings);

    // Determine PR base branch:
    // - If feature belongs to an epic and epicBranchName is provided, use it
    // - If feature is an epic itself, use the default base (main)
    // - Otherwise use the default base from settings
    const prBaseBranch =
      epicBranchName && !feature.isEpic ? epicBranchName : gitSettings.prBaseBranch;

    logger.debug(
      `Git workflow for ${featureId}: isEpic=${feature.isEpic}, epicId=${feature.epicId}, base=${prBaseBranch}`
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
      const commitHash = await this.commitChanges(workDir, feature);
      if (!commitHash) {
        logger.info(`No changes to commit for feature ${featureId}`);
        return null;
      }
      result.commitHash = commitHash;
      logger.info(`Committed changes for feature ${featureId}: ${commitHash}`);

      // Step 2: Push to remote (if enabled)
      if (gitSettings.autoPush) {
        try {
          const pushed = await this.pushToRemote(workDir, branchName);
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

        // Step 3: Create PR (if push succeeded and PR creation enabled)
        if (result.pushed && gitSettings.autoCreatePR) {
          try {
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
            if (prResult.prUrl) {
              logger.info(
                `PR ${prResult.prAlreadyExisted ? 'exists' : 'created'}: ${prResult.prUrl}`
              );
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
   * Commit all changes in the working directory.
   * @returns Commit hash (short) if changes were committed, null if no changes
   */
  private async commitChanges(workDir: string, feature: Feature): Promise<string | null> {
    // Check for changes
    const { stdout: status } = await execAsync('git status --porcelain', {
      cwd: workDir,
      env: execEnv,
    });

    if (!status.trim()) {
      return null; // No changes
    }

    // Generate commit message
    const title = feature.title || extractTitleFromDescription(feature.description);
    const commitMessage = `feat: ${title}\n\nImplemented by Automaker auto-mode\nFeature ID: ${feature.id}`;

    // Stage all changes
    await execAsync('git add -A', { cwd: workDir, env: execEnv });

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
  ): Promise<{ prUrl: string | null; prNumber?: number; prAlreadyExisted?: boolean }> {
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
    let originOwner: string | null = null;

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
            originOwner = owner;
            originRepo = `${owner}/${repoName}`;
          }
        }
      }
    } catch {
      // Couldn't parse remotes
    }

    // Determine target repo: use upstream if it's a fork, otherwise use origin
    // Always use explicit --repo to avoid gh CLI defaulting to wrong repo
    const targetRepo = upstreamRepo || originRepo;
    const headRef = upstreamRepo && originOwner ? `${originOwner}:${branchName}` : branchName;
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

    if (upstreamRepo && originOwner) {
      // Fork workflow: need to specify head as owner:branch
      prCmd += ` --head "${originOwner}:${branchName}"`;
    } else {
      prCmd += ` --head "${branchName}"`;
    }

    prCmd += ` --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`;

    try {
      const { stdout: prOutput } = await execAsync(prCmd, {
        cwd: workDir,
        env: execEnv,
      });
      const prUrl = prOutput.trim();

      // Extract PR number and store metadata
      let prNumber: number | undefined;
      const prMatch = prUrl.match(/\/pull\/(\d+)/);
      if (prMatch) {
        prNumber = parseInt(prMatch[1], 10);

        await updateWorktreePRInfo(projectPath, branchName, {
          number: prNumber,
          url: prUrl,
          title,
          state: 'OPEN',
          createdAt: new Date().toISOString(),
        });
      }

      return { prUrl, prNumber, prAlreadyExisted: false };
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
