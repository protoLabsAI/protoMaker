/**
 * StalePRCheck - Detects PRs in review status that are behind their base branch.
 *
 * Features in 'review' status whose PRs have fallen behind the base branch will
 * fail CI merge checks. This check identifies them so they can be rebased.
 *
 * Detection uses the GitHub CLI (gh) to fetch PR metadata and git rev-list to
 * count the number of commits the head branch is behind the base branch.
 *
 * No auto-fix — the rebase operation is handled by autoRebaseStalePRs in maintenance-tasks.ts.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { FeatureLoader } from '../../feature-loader.js';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const logger = createLogger('StalePRCheck');

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { cwd: string; encoding: string; timeout: number }
) => Promise<{ stdout: string; stderr: string }>;

interface PRBehindStatus {
  prNumber: number;
  branchName: string;
  baseBranch: string;
  isBehind: boolean;
  behindBy?: number;
}

export class StalePRCheck implements MaintenanceCheck {
  readonly id = 'stale-pr';

  private readonly execFileAsync: ExecFileAsync;

  constructor(
    private readonly featureLoader: FeatureLoader,
    execFileAsyncOverride?: ExecFileAsync
  ) {
    this.execFileAsync = execFileAsyncOverride ?? (promisify(execFile) as ExecFileAsync);
  }

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      const features = await this.featureLoader.getAll(projectPath);
      const reviewFeatures = features.filter(
        (f) => f.status === 'review' && f.prNumber != null && f.branchName
      );

      for (const feature of reviewFeatures) {
        const behindStatus = await this.checkPRBehindStatus(projectPath, feature.prNumber!);

        if (!behindStatus || !behindStatus.isBehind) continue;

        issues.push({
          checkId: this.id,
          severity: 'warning',
          featureId: feature.id,
          message: `PR #${feature.prNumber} (${feature.title || feature.id}) is ${behindStatus.behindBy} commit(s) behind ${behindStatus.baseBranch}`,
          autoFixable: false,
          context: {
            featureId: feature.id,
            featureTitle: feature.title,
            prNumber: feature.prNumber,
            branchName: behindStatus.branchName,
            baseBranch: behindStatus.baseBranch,
            behindBy: behindStatus.behindBy,
            projectPath,
          },
        });
      }
    } catch (error) {
      logger.error(`StalePRCheck failed for ${projectPath}:`, error);
    }

    return issues;
  }

  private async checkPRBehindStatus(
    projectPath: string,
    prNumber: number
  ): Promise<PRBehindStatus | null> {
    try {
      const { stdout } = await this.execFileAsync(
        'gh',
        ['pr', 'view', String(prNumber), '--json', 'headRefName,baseRefName,mergeable'],
        { cwd: projectPath, encoding: 'utf-8', timeout: 10_000 }
      );

      const prData = JSON.parse(stdout);
      const headBranch: string = prData.headRefName;
      const baseBranch: string = prData.baseRefName;

      const { stdout: revListOutput } = await this.execFileAsync(
        'git',
        ['rev-list', '--count', `${headBranch}..${baseBranch}`],
        { cwd: projectPath, encoding: 'utf-8', timeout: 10_000 }
      );

      const behindBy = parseInt(revListOutput.trim(), 10);
      const isBehind = behindBy > 0;

      return {
        prNumber,
        branchName: headBranch,
        baseBranch,
        isBehind,
        behindBy: isBehind ? behindBy : undefined,
      };
    } catch (error) {
      logger.warn(`Failed to check if PR #${prNumber} is behind base:`, error);
      return null;
    }
  }
}
