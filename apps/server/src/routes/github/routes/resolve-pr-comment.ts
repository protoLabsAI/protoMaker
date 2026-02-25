/**
 * POST /github/resolve-pr-comment endpoint
 * Resolve a single PR review thread via GitHub GraphQL resolveReviewThread mutation
 */

import type { Request, Response } from 'express';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';

interface ResolvePRCommentRequest {
  projectPath: string;
  threadId: string;
}

export function createResolvePRCommentHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, threadId } = req.body as ResolvePRCommentRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!threadId) {
        res.status(400).json({ success: false, error: 'threadId is required' });
        return;
      }

      const mutation = `
        mutation {
          resolveReviewThread(input: { threadId: "${threadId}" }) {
            thread {
              id
              isResolved
            }
          }
        }
      `;

      const { stdout } = await execAsync(`gh api graphql -f query='${mutation}'`, {
        cwd: projectPath,
        env: execEnv,
      });

      const data = JSON.parse(stdout);

      if (data.errors && data.errors.length > 0) {
        const errMsg = data.errors.map((e: { message: string }) => e.message).join('; ');
        res.status(400).json({ success: false, error: errMsg });
        return;
      }

      const thread = data.data?.resolveReviewThread?.thread;

      res.json({
        success: true,
        threadId: thread?.id ?? threadId,
        isResolved: thread?.isResolved ?? true,
      });
    } catch (error) {
      logError(error, 'Resolve PR comment failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
