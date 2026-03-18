/**
 * EpicCompletionCheck - Detects epics whose children are all done but the epic itself is not.
 *
 * When all child features of an epic reach a terminal status, the epic should also
 * be transitioned to done. This check finds epics that have been missed.
 *
 * Auto-fix behavior:
 * - Epics WITHOUT a git branch: automatically set to 'done'
 * - Epics WITH a git branch that DOES NOT exist on remote: automatically set to 'done'
 *   (children merged directly to the base branch — no epic branch was created)
 * - Epics WITH a git branch that EXISTS on remote: NOT auto-fixable — delegate to
 *   CompletionDetectorService which handles the epic-to-dev PR creation flow.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from '../../feature-loader.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const execFileAsync = promisify(execFile);

const logger = createLogger('EpicCompletionCheck');

const DONE_STATUSES = new Set(['done', 'completed', 'verified']);

export class EpicCompletionCheck implements MaintenanceCheck {
  readonly id = 'epic-completion';

  constructor(private readonly featureLoader: FeatureLoader) {}

  /**
   * Returns true if the given branch exists on the remote (origin).
   * An empty result from git ls-remote means the branch is absent.
   */
  private async epicBranchExistsOnRemote(
    projectPath: string,
    branchName: string
  ): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['ls-remote', '--heads', 'origin', branchName],
        { cwd: projectPath, timeout: 15000 }
      );
      return stdout.trim().length > 0;
    } catch {
      // If the git command fails (no remote, no network), assume branch absent
      return false;
    }
  }

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      const features = await this.featureLoader.getAll(projectPath);

      const epics = features.filter((f) => f.isEpic);

      for (const epic of epics) {
        if (DONE_STATUSES.has(epic.status ?? '')) continue;

        const children = features.filter((f) => f.epicId === epic.id);
        if (children.length === 0) continue;

        const allChildrenDone = children.every((c) => DONE_STATUSES.has(c.status ?? ''));
        if (!allChildrenDone) continue;

        const hasGitBranch = !!epic.branchName;

        // For git-backed epics, check if the branch actually exists on the remote.
        // When prBaseBranch targets dev directly, children merge to dev and the epic
        // branch is never pushed — in that case we can auto-fix by marking done directly.
        let branchExistsOnRemote = false;
        if (hasGitBranch) {
          branchExistsOnRemote = await this.epicBranchExistsOnRemote(projectPath, epic.branchName!);
        }

        // Auto-fixable when:
        // - Epic has no git branch (manual/non-git epic), OR
        // - Epic has a branch but it doesn't exist on remote (children merged directly to base)
        const autoFixable = !hasGitBranch || !branchExistsOnRemote;

        issues.push({
          checkId: this.id,
          severity: 'warning',
          featureId: epic.id,
          message: `Epic "${epic.title || epic.id}" has ${children.length} child(ren), all done, but epic status is '${epic.status}'`,
          autoFixable,
          fixDescription:
            hasGitBranch && branchExistsOnRemote
              ? 'Delegate to CompletionDetectorService for epic-to-dev PR creation'
              : 'Set epic status to done',
          context: {
            featureId: epic.id,
            epicTitle: epic.title,
            currentStatus: epic.status,
            childCount: children.length,
            hasGitBranch,
            branchExistsOnRemote,
            projectPath,
          },
        });
      }
    } catch (error) {
      logger.error(`EpicCompletionCheck failed for ${projectPath}:`, error);
    }

    return issues;
  }

  async fix(projectPath: string, issue: MaintenanceIssue): Promise<void> {
    const featureId = issue.featureId;
    if (!featureId) return;

    const hasGitBranch = issue.context?.hasGitBranch as boolean | undefined;
    const branchExistsOnRemote = issue.context?.branchExistsOnRemote as boolean | undefined;

    // Git-backed epic whose branch exists on remote — needs CompletionDetectorService
    // to create the epic-to-dev PR. Cannot auto-fix here.
    if (hasGitBranch && branchExistsOnRemote) {
      logger.warn(
        `Skipping auto-fix for git-backed epic ${featureId} (branch exists on remote) — delegate to CompletionDetectorService`
      );
      return;
    }

    // Either no branch, or branch doesn't exist on remote (children merged directly to base).
    // Mark done directly, same path as CompletionDetectorService.checkEpicCompletion().
    const reason = hasGitBranch
      ? `children merged directly to base branch (epic branch not found on remote)`
      : `no git branch`;
    logger.info(`Setting epic ${featureId} to done (${reason})`);
    await this.featureLoader.update(projectPath, featureId, { status: 'done' });
    logger.info(`Epic ${featureId} set to done`);
  }
}
