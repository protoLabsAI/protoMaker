/**
 * POST /api/github/check-pr-status endpoint
 * Check the CI/CD status of a pull request
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { githubMergeService } from '../../../services/github-merge-service.js';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

const logger = createLogger('CheckPRStatus');

interface CheckPRStatusRequest {
  projectPath: string;
  prNumber: number;
}

interface PRCheckResult {
  /** Name of the check/workflow */
  name: string;
  /** Current status (QUEUED, IN_PROGRESS, COMPLETED) */
  status: string;
  /** Conclusion if completed (SUCCESS, FAILURE, CANCELLED, etc.) */
  conclusion?: string;
  /** Whether this check passed */
  passed: boolean;
}

interface CheckPRStatusResponse {
  success: boolean;
  prNumber: number;
  /** Whether all checks have passed */
  allChecksPassed: boolean;
  /** Number of checks that passed */
  passedCount: number;
  /** Number of checks that failed */
  failedCount: number;
  /** Number of checks still pending */
  pendingCount: number;
  /** List of failed check names */
  failedChecks: string[];
  /** Detailed check results */
  checks: PRCheckResult[];
  error?: string;
}

export function createCheckPRStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prNumber } = req.body as CheckPRStatusRequest;

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

      // Check if this is a GitHub repo
      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote || !remoteStatus.owner || !remoteStatus.repo) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      logger.info(`Checking status for PR #${prNumber}`);

      // Verify PR exists
      try {
        const repoQualifier = `${remoteStatus.owner}/${remoteStatus.repo}`;
        const prInfoCmd = `gh pr view ${prNumber} -R ${repoQualifier} --json number,state`;

        const { stdout: prInfoOutput } = await execAsync(prInfoCmd, {
          cwd: projectPath,
          env: execEnv,
        });

        const prInfo = JSON.parse(prInfoOutput);

        if (!prInfo.number) {
          res.status(404).json({
            success: false,
            error: `PR #${prNumber} not found`,
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

      // Get detailed check status
      const checkStatus = await githubMergeService.checkPRStatus(projectPath, prNumber);

      // Get detailed check information for response
      try {
        const repoQualifier = `${remoteStatus.owner}/${remoteStatus.repo}`;
        const checksCmd = `gh pr view ${prNumber} -R ${repoQualifier} --json statusCheckRollup`;

        const { stdout: checksOutput } = await execAsync(checksCmd, {
          cwd: projectPath,
          env: execEnv,
        });

        const checksData = JSON.parse(checksOutput);
        const rollup = checksData.statusCheckRollup || [];

        const checks: PRCheckResult[] = rollup.map(
          (check: { name: string; status: string; conclusion?: string; context?: string }) => {
            const status = check.status?.toUpperCase() || 'UNKNOWN';
            const conclusion = check.conclusion?.toUpperCase();
            const name = check.name || check.context || 'Unknown check';

            // Determine if check passed
            let passed = false;
            if (status === 'COMPLETED') {
              passed =
                conclusion === 'SUCCESS' || conclusion === 'NEUTRAL' || conclusion === 'SKIPPED';
            }

            return {
              name,
              status,
              conclusion,
              passed,
            };
          }
        );

        logger.info(
          `PR #${prNumber} status: ${checkStatus.passedCount} passed, ${checkStatus.failedCount} failed, ${checkStatus.pendingCount} pending`
        );

        res.json({
          success: true,
          prNumber,
          allChecksPassed: checkStatus.allChecksPassed,
          passedCount: checkStatus.passedCount,
          failedCount: checkStatus.failedCount,
          pendingCount: checkStatus.pendingCount,
          failedChecks: checkStatus.failedChecks,
          checks,
        });
      } catch (error) {
        // If we can't get detailed checks, return summary from checkPRStatus
        logger.warn(`Could not get detailed check info: ${error}`);

        res.json({
          success: true,
          prNumber,
          allChecksPassed: checkStatus.allChecksPassed,
          passedCount: checkStatus.passedCount,
          failedCount: checkStatus.failedCount,
          pendingCount: checkStatus.pendingCount,
          failedChecks: checkStatus.failedChecks,
          checks: [],
        });
      }
    } catch (error) {
      logError(error, 'Check PR status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
