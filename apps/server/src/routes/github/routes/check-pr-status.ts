/**
 * POST /check-pr-status endpoint
 * Check the CI status of a pull request
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import { githubMergeService } from '../../../services/github-merge-service.js';
import { getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

const logger = createLogger('CheckPRStatusRoute');

interface CheckPRStatusRequest {
  projectPath: string;
  prNumber: number;
}

export function createCheckPRStatusHandler() {
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

      res.json({
        success: true,
        ...checkStatus,
      });
    } catch (error) {
      logError(error, 'Check PR status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
