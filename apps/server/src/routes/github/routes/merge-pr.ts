/**
 * POST /merge-pr endpoint
 * Merge a pull request using GitHub API
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { PRMergeStrategy } from '@protolabs-ai/types';
import { githubMergeService } from '../../../services/github-merge-service.js';
import { getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

const logger = createLogger('MergePRRoute');

interface MergePRRequest {
  projectPath: string;
  prNumber: number;
  strategy?: PRMergeStrategy;
  waitForCI?: boolean;
}

export function createMergePRHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        prNumber,
        strategy = 'squash',
        waitForCI = true,
      } = req.body as MergePRRequest;

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

      // Validate strategy if provided
      const validStrategies: PRMergeStrategy[] = ['merge', 'squash', 'rebase'];
      if (strategy && !validStrategies.includes(strategy)) {
        res.status(400).json({
          success: false,
          error: `Invalid strategy. Must be one of: ${validStrategies.join(', ')}`,
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

      logger.info(`Merging PR #${prNumber} with strategy: ${strategy}, waitForCI: ${waitForCI}`);

      // Attempt to merge the PR
      const result = await githubMergeService.mergePR(projectPath, prNumber, strategy, waitForCI);

      // Return result
      if (result.success) {
        logger.info(`Successfully merged PR #${prNumber}`);
        res.json(result);
      } else {
        // Still return 200 with success: false for expected failures (pending checks, etc.)
        logger.warn(`Failed to merge PR #${prNumber}: ${result.error}`);
        res.json(result);
      }
    } catch (error) {
      logError(error, 'Merge PR failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
