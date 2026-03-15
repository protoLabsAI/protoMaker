/**
 * EpicCompletionCheck - Detects epics whose children are all done but the epic itself is not.
 *
 * When all child features of an epic reach a terminal status, the epic should also
 * be transitioned to done. This check finds epics that have been missed.
 *
 * Auto-fix behavior:
 * - Epics WITHOUT a git branch: automatically set to 'done'
 * - Epics WITH a git branch: NOT auto-fixable — delegate to CompletionDetectorService
 *   which handles the epic-to-dev PR creation flow.
 */

import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from '../../feature-loader.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const logger = createLogger('EpicCompletionCheck');

const DONE_STATUSES = new Set(['done', 'completed', 'verified']);

export class EpicCompletionCheck implements MaintenanceCheck {
  readonly id = 'epic-completion';

  constructor(private readonly featureLoader: FeatureLoader) {}

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

        issues.push({
          checkId: this.id,
          severity: 'warning',
          featureId: epic.id,
          message: `Epic "${epic.title || epic.id}" has ${children.length} child(ren), all done, but epic status is '${epic.status}'`,
          autoFixable: !hasGitBranch,
          fixDescription: hasGitBranch
            ? 'Delegate to CompletionDetectorService for epic-to-dev PR creation'
            : 'Set epic status to done',
          context: {
            featureId: epic.id,
            epicTitle: epic.title,
            currentStatus: epic.status,
            childCount: children.length,
            hasGitBranch,
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

    // Only fix epics without a git branch — git-backed epics need CompletionDetectorService
    const hasGitBranch = issue.context?.hasGitBranch as boolean | undefined;
    if (hasGitBranch) {
      logger.warn(
        `Skipping auto-fix for git-backed epic ${featureId} — delegate to CompletionDetectorService`
      );
      return;
    }

    logger.info(`Setting epic ${featureId} status to done`);
    await this.featureLoader.update(projectPath, featureId, { status: 'done' });
    logger.info(`Set epic ${featureId} status to done`);
  }
}
