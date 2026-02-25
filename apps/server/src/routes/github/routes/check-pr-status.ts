/**
 * POST /check-pr-status endpoint
 * Check the CI status of a pull request
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { githubMergeService } from '../../../services/github-merge-service.js';
import { getErrorMessage, logError, execAsync, execEnv } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';
import { parsePROwnershipWatermark, isPRStale } from '../utils/pr-ownership.js';
import type { PROwnership } from '../utils/pr-ownership.js';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('CheckPRStatusRoute');

interface CheckPRStatusRequest {
  projectPath: string;
  prNumber: number;
}

/** Ownership info returned as part of the check-pr-status response */
interface PROwnershipStatus extends PROwnership {
  /** True if the instanceId on the PR matches this Automaker instance */
  isOwnedByThisInstance: boolean;
  /** True when both lastCommitAge and lastActivityAge exceed the staleTtl */
  isStale: boolean;
}

export function createCheckPRStatusHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prNumber } = req.body as CheckPRStatusRequest;

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

      logger.info(`Checking PR #${prNumber} CI status`);

      // Get PR check status
      const checkStatus = await githubMergeService.checkPRStatus(projectPath, prNumber);

      logger.info(
        `PR #${prNumber} status: ${checkStatus.passedCount} passed, ${checkStatus.failedCount} failed, ${checkStatus.pendingCount} pending`
      );

      // Fetch PR body and timestamps to parse ownership watermark
      let ownership: PROwnershipStatus = {
        instanceId: null,
        teamId: null,
        createdAt: null,
        isOwnedByThisInstance: false,
        isStale: false,
      };

      try {
        const { stdout: prDataJson } = await execAsync(
          `gh pr view ${prNumber} --repo ${remoteStatus.owner}/${remoteStatus.repo} --json body,updatedAt,commits`,
          { cwd: projectPath, env: execEnv }
        );
        const prData = JSON.parse(prDataJson) as {
          body?: string;
          updatedAt?: string;
          commits?: Array<{ committedDate?: string }>;
        };

        const parsed = parsePROwnershipWatermark(prData.body ?? '');

        // Determine if this instance owns the PR
        let isOwnedByThisInstance = false;
        if (settingsService && parsed.instanceId) {
          const thisInstanceId = await settingsService.getInstanceId();
          isOwnedByThisInstance = parsed.instanceId === thisInstanceId;
        }

        // Compute staleness from PR timestamps
        const now = Date.now();
        const updatedAt = prData.updatedAt ? new Date(prData.updatedAt).getTime() : now;
        const lastActivityAgeHours = (now - updatedAt) / (1000 * 60 * 60);

        let lastCommitAgeHours = lastActivityAgeHours;
        if (prData.commits && prData.commits.length > 0) {
          const lastCommit = prData.commits[prData.commits.length - 1];
          const committedDate = lastCommit.committedDate
            ? new Date(lastCommit.committedDate).getTime()
            : now;
          lastCommitAgeHours = (now - committedDate) / (1000 * 60 * 60);
        }

        const staleTtlHours = settingsService
          ? ((await settingsService.getGlobalSettings()).prOwnershipStaleTtlHours ?? 24)
          : 24;

        const isStale = isPRStale(lastCommitAgeHours, lastActivityAgeHours, staleTtlHours);

        ownership = { ...parsed, isOwnedByThisInstance, isStale };
      } catch (ownershipErr) {
        logger.debug('Failed to fetch PR ownership info:', ownershipErr);
      }

      res.json({
        success: true,
        ...checkStatus,
        ownership,
      });
    } catch (error) {
      logError(error, 'Check PR status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
