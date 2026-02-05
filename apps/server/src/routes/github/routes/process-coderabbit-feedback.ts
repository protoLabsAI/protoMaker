/**
 * POST /process-coderabbit-feedback endpoint
 * Process CodeRabbit review feedback for a PR and link to feature
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../../../lib/events.js';
import type { GitHubComment, FeatureCodeRabbitFeedback } from '@automaker/types';
import { codeRabbitParserService } from '../../../services/coderabbit-parser-service.js';
import { featureBranchLinkingService } from '../../../services/feature-branch-linking-service.js';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

const logger = createLogger('ProcessCodeRabbitFeedback');

interface ProcessCodeRabbitFeedbackRequest {
  projectPath: string;
  prNumber: number;
}

interface ProcessCodeRabbitFeedbackResponse {
  success: boolean;
  featureId?: string;
  commentCount?: number;
  error?: string;
}

export function createProcessCodeRabbitFeedbackHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prNumber } = req.body as ProcessCodeRabbitFeedbackRequest;

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

      logger.info(`Processing CodeRabbit feedback for PR #${prNumber}`);

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

      // Step 2: Find feature linked to this branch
      const featureLink = await featureBranchLinkingService.getFeatureByBranch(
        projectPath,
        branchName
      );

      if (!featureLink) {
        // Try to find by PR number
        const featureLinkByPR = await featureBranchLinkingService.getFeatureByPR(
          projectPath,
          prNumber
        );

        if (!featureLinkByPR) {
          res.status(404).json({
            success: false,
            error: `No feature found linked to branch ${branchName} or PR #${prNumber}`,
          });
          return;
        }
      }

      const linkedFeatureId = featureLink?.featureId || '';

      // Step 3: Fetch PR comments using GraphQL (supports pagination)
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
      const comments: GitHubComment[] =
        commentsData.data?.repository?.pullRequest?.comments?.nodes?.map((node: {
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
        })) || [];

      logger.debug(`Fetched ${comments.length} comments for PR #${prNumber}`);

      // Step 4: Parse CodeRabbit comments
      const parseResult = codeRabbitParserService.parseReview(prNumber, prUrl, comments);

      if (!parseResult.success || !parseResult.review) {
        res.json({
          success: false,
          error: parseResult.error || 'Failed to parse CodeRabbit review',
        });
        return;
      }

      logger.info(
        `Found ${parseResult.review.comments.length} CodeRabbit comments in PR #${prNumber}`
      );

      // Step 5: Store feedback linked to feature
      const feedback: FeatureCodeRabbitFeedback = {
        featureId: linkedFeatureId,
        branchName,
        review: parseResult.review,
        processedAt: new Date().toISOString(),
      };

      await featureBranchLinkingService.storeCodeRabbitFeedback(projectPath, feedback);

      // Step 6: Emit event for frontend/webhooks
      events.emit('coderabbit:feedback-processed', {
        featureId: linkedFeatureId,
        prNumber,
        commentCount: parseResult.review.comments.length,
      });

      res.json({
        success: true,
        featureId: linkedFeatureId,
        commentCount: parseResult.review.comments.length,
      });
    } catch (error) {
      logError(error, 'Process CodeRabbit feedback failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
