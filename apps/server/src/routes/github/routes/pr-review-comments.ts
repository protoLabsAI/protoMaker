/**
 * POST /github/pr-review-comments endpoint
 * List inline code review comment threads on a PR via GitHub GraphQL API
 */

import type { Request, Response } from 'express';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

interface PRReviewCommentsRequest {
  projectPath: string;
  prNumber: number;
  includeResolved?: boolean;
}

interface ReviewComment {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  path: string;
  line: number | null;
  startLine: number | null;
  diffSide: string;
  comments: ReviewComment[];
}

export function createPRReviewCommentsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        prNumber,
        includeResolved = false,
      } = req.body as PRReviewCommentsRequest;

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

      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote || !remoteStatus.owner || !remoteStatus.repo) {
        res.status(400).json({ success: false, error: 'Project does not have a GitHub remote' });
        return;
      }

      const query = `
        query {
          repository(owner: "${remoteStatus.owner}", name: "${remoteStatus.repo}") {
            pullRequest(number: ${prNumber}) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  diffSide
                  line
                  startLine
                  path
                  comments(first: 20) {
                    nodes {
                      id
                      body
                      author {
                        login
                      }
                      createdAt
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const { stdout } = await execAsync(`gh api graphql -f query='${query}'`, {
        cwd: projectPath,
        env: execEnv,
      });

      const data = JSON.parse(stdout);
      const rawThreads: Array<{
        id: string;
        isResolved: boolean;
        diffSide: string;
        line: number | null;
        startLine: number | null;
        path: string;
        comments: {
          nodes: Array<{
            id: string;
            body: string;
            author: { login: string };
            createdAt: string;
          }>;
        };
      }> = data.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

      const threads: ReviewThread[] = rawThreads
        .filter((t) => includeResolved || !t.isResolved)
        .map((t) => ({
          id: t.id,
          isResolved: t.isResolved,
          path: t.path,
          line: t.line,
          startLine: t.startLine,
          diffSide: t.diffSide,
          comments: t.comments.nodes.map((c) => ({
            id: c.id,
            body: c.body,
            author: c.author.login,
            createdAt: c.createdAt,
          })),
        }));

      res.json({
        success: true,
        prNumber,
        threads,
        total: threads.length,
      });
    } catch (error) {
      logError(error, 'PR review comments failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
