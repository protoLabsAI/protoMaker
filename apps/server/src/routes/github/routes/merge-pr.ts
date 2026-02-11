/**
 * POST /api/github/merge-pr endpoint
 * Merge a pull request using GitHub CLI
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { PRMergeStrategy } from '@automaker/types';
import { githubMergeService } from '../../../services/github-merge-service.js';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

const logger = createLogger('MergePR');

interface MergePRRequest {
  projectPath: string;
  prNumber: number;
  mergeStrategy?: PRMergeStrategy;
  waitForCI?: boolean;
}

interface MergePRResponse {
  success: boolean;
  mergeCommitSha?: string;
  error?: string;
  checksPending?: boolean;
  checksFailed?: boolean;
  failedChecks?: string[];
}

export function createMergePRHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        prNumber,
        mergeStrategy = 'squash',
        waitForCI = true,
      } = req.body as MergePRRequest;

      // Validate required parameters
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!prNumber || typeof prNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'prNumber is required and must be a number' });
        return;
      }

      // Validate merge strategy
      const validStrategies: PRMergeStrategy[] = ['merge', 'squash', 'rebase'];
      if (!validStrategies.includes(mergeStrategy)) {
        res.status(400).json({
          success: false,
          error: `Invalid mergeStrategy. Must be one of: ${validStrategies.join(', ')}`,
        });
        return;
      }

      // Check if this is a GitHub repo
      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote || !remoteStatus.owner || !remoteStatus.repo) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      logger.info(
        `Merging PR #${prNumber} with strategy: ${mergeStrategy}, waitForCI: ${waitForCI}`
      );

      // Verify PR exists and get basic info
      try {
        const repoQualifier = `${remoteStatus.owner}/${remoteStatus.repo}`;
        const prInfoCmd = `gh pr view ${prNumber} -R ${repoQualifier} --json number,state`;

        const { stdout: prInfoOutput } = await execAsync(prInfoCmd, {
          cwd: projectPath,
          env: execEnv,
        });

        const prInfo = JSON.parse(prInfoOutput);

        if (prInfo.state !== 'OPEN') {
          res.status(400).json({
            success: false,
            error: `PR #${prNumber} is ${prInfo.state}, not OPEN`,
          });
          return;
        }
      } catch (error) {
        logger.error(`Failed to get PR info: ${error}`);
        res.status(404).json({
          success: false,
          error: `PR #${prNumber} not found or inaccessible`,
        });
        return;
      }

      // Attempt to merge the PR
      const result = await githubMergeService.mergePR(
        projectPath,
        prNumber,
        mergeStrategy,
        waitForCI
      );

      if (result.success) {
        logger.info(`Successfully merged PR #${prNumber}`);
        res.json({
          success: true,
          mergeCommitSha: result.mergeCommitSha,
        });
      } else {
        // Return appropriate status code based on error type
        const statusCode = result.checksPending || result.checksFailed ? 409 : 400;

        res.status(statusCode).json({
          success: false,
          error: result.error,
          checksPending: result.checksPending,
          checksFailed: result.checksFailed,
          failedChecks: result.failedChecks,
        });
      }
    } catch (error) {
      logError(error, 'Merge PR failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
