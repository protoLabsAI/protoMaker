/**
 * POST /comment endpoint
 * Post a comment to an existing GitHub issue.
 */

import type { Request, Response } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import { createGitExecEnv } from '@protolabsai/git-utils';
import { getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('AddGitHubComment');

interface AddCommentRequest {
  projectPath: string;
  issueNumber: number;
  body: string;
}

export function createAddCommentHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber, body } = req.body as AddCommentRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (
        issueNumber === undefined ||
        typeof issueNumber !== 'number' ||
        !Number.isInteger(issueNumber) ||
        issueNumber <= 0
      ) {
        res.status(400).json({
          success: false,
          error: 'issueNumber is required and must be a positive integer',
        });
        return;
      }
      if (!body || typeof body !== 'string' || !body.trim()) {
        res.status(400).json({ success: false, error: 'body is required' });
        return;
      }

      // Confirm this is a GitHub repo and resolve owner/repo.
      const remote = await checkGitHubRemote(projectPath);
      if (!remote.hasGitHubRemote || !remote.owner || !remote.repo) {
        res.status(400).json({ success: false, error: 'Project does not have a GitHub remote' });
        return;
      }

      // execFile with an argument array — the body is passed as a discrete arg and
      // is NEVER interpreted by a shell, so arbitrary comment content (backticks,
      // $(...), quotes, newlines) is safe. `gh issue comment` prints the comment URL.
      const { stdout } = await execFileAsync(
        'gh',
        [
          'issue',
          'comment',
          String(issueNumber),
          '--repo',
          `${remote.owner}/${remote.repo}`,
          '--body',
          body,
        ],
        { cwd: projectPath, env: createGitExecEnv(), timeout: 20000 }
      );

      const commentUrl = stdout.trim();
      logger.info(`Posted comment to ${remote.owner}/${remote.repo}#${issueNumber}`);
      res.json({ success: true, issueNumber, commentUrl });
    } catch (error) {
      logError(error, 'Add GitHub comment failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
