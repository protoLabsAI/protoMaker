/**
 * POST /get-pr-feedback endpoint
 * Fetch CodeRabbit review feedback for a PR, including both issue-level and inline review threads with severity
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { GitHubComment } from '@automaker/types';
import { codeRabbitParserService } from '../../../services/coderabbit-parser-service.js';
import { featureBranchLinkingService } from '../../../services/feature-branch-linking-service.js';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

const logger = createLogger('GetPRFeedback');

interface GetPRFeedbackRequest {
  projectPath: string;
  prNumber: number;
  includeInlineThreads?: boolean;
}

export function createGetPRFeedbackHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prNumber, includeInlineThreads } = req.body as GetPRFeedbackRequest;

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

      logger.info(`Fetching CodeRabbit feedback for PR #${prNumber}`);

      // Step 1: Get PR info including branch name and URL
      const repoQualifier = `${remoteStatus.owner}/${remoteStatus.repo}`;
      const prInfoCmd = `gh pr view ${prNumber} -R ${repoQualifier} --json number,url,headRefName`;

      const { stdout: prInfoOutput } = await execAsync(prInfoCmd, {
        cwd: projectPath,
        env: execEnv,
      });

      const prInfo = JSON.parse(prInfoOutput);
      const branchName = prInfo.headRefName as string;
      const prUrl = prInfo.url as string;

      logger.debug(`PR #${prNumber} is for branch: ${branchName}`);

      // Step 2: Find feature linked to this branch (optional — manual PRs won't have one)
      const featureLink = await featureBranchLinkingService.getFeatureByBranch(
        projectPath,
        branchName
      );

      let linkedFeatureId = featureLink?.featureId || '';

      if (!linkedFeatureId) {
        // Try to find by PR number
        const featureLinkByPR = await featureBranchLinkingService.getFeatureByPR(
          projectPath,
          prNumber
        );
        linkedFeatureId = featureLinkByPR?.featureId || '';
      }

      // Step 3: Fetch PR issue-level comments using GraphQL
      const commentsCmd = `gh api graphql -f query='
        query {
          repository(owner: "${remoteStatus.owner}", name: "${remoteStatus.repo}") {
            pullRequest(number: ${prNumber}) {
              comments(first: 100) {
                nodes {
                  id
                  author {
                    login
                  }
                  body
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }
      '`;

      const { stdout: commentsOutput } = await execAsync(commentsCmd, {
        cwd: projectPath,
        env: execEnv,
      });

      const commentsData = JSON.parse(commentsOutput);
      const issueComments: GitHubComment[] =
        commentsData.data?.repository?.pullRequest?.comments?.nodes?.map(
          (node: {
            id: string;
            author: { login: string };
            body: string;
            createdAt: string;
            updatedAt: string;
          }) => ({
            id: node.id,
            author: { login: node.author.login },
            body: node.body,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
          })
        ) || [];

      logger.debug(`Fetched ${issueComments.length} issue-level comments for PR #${prNumber}`);

      // Step 4: Optionally fetch inline review threads
      let inlineThreads: Array<{
        id: string;
        path: string;
        line: number;
        body: string;
        author: string;
        severity?: string;
      }> = [];

      if (includeInlineThreads) {
        const reviewThreadsCmd = `gh api graphql -f query='
          query {
            repository(owner: "${remoteStatus.owner}", name: "${remoteStatus.repo}") {
              pullRequest(number: ${prNumber}) {
                reviewThreads(first: 100) {
                  nodes {
                    id
                    isResolved
                    comments(first: 10) {
                      nodes {
                        id
                        body
                        author {
                          login
                        }
                        path
                        line
                      }
                    }
                  }
                }
              }
            }
          }
        '`;

        const { stdout: reviewThreadsOutput } = await execAsync(reviewThreadsCmd, {
          cwd: projectPath,
          env: execEnv,
        });

        const reviewThreadsData = JSON.parse(reviewThreadsOutput);
        const threads = reviewThreadsData.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

        inlineThreads = threads.flatMap((thread: any) => {
          if (thread.isResolved) return [];

          return thread.comments.nodes
            .filter((comment: any) => comment.author.login === 'coderabbitai')
            .map((comment: any) => {
              // Parse severity from comment body if present
              const severityMatch = comment.body.match(/severity[:\s]+(\w+)/i);
              const severity = severityMatch ? severityMatch[1].toLowerCase() : undefined;

              return {
                id: comment.id,
                path: comment.path,
                line: comment.line,
                body: comment.body,
                author: comment.author.login,
                severity,
              };
            });
        });

        logger.debug(`Fetched ${inlineThreads.length} inline review threads for PR #${prNumber}`);
      }

      // Step 5: Parse CodeRabbit comments (issue-level only for now)
      codeRabbitParserService.parseReview(prNumber, prUrl, issueComments);

      res.json({
        success: true,
        featureId: linkedFeatureId,
        branchName,
        prUrl,
        issueComments,
        inlineThreads: includeInlineThreads ? inlineThreads : undefined,
        commentCount: issueComments.length + inlineThreads.length,
      });
    } catch (error) {
      logError(error, 'Get PR feedback failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
