/**
 * POST /resolve-pr-threads endpoint
 * Resolve all unresolved CodeRabbit review threads for a PR.
 *
 * Uses GitHub GraphQL `reviewThreads` to fetch PRRT_ thread node IDs, then
 * calls the `resolveReviewThread` mutation for each unresolved thread. Supports
 * an optional `minSeverity` gate to skip lower-severity threads.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../../../lib/events.js';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';
import { assertSafeShellInteger } from '@protolabs-ai/platform';

const logger = createLogger('ResolvePRThreads');

interface ResolvePRThreadsRequest {
  projectPath: string;
  prNumber: number;
  minSeverity?: 'low' | 'medium' | 'high';
}

const SEVERITY_LEVELS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/** Parse a severity keyword from a CodeRabbit thread body. */
function parseSeverityFromBody(body: string): 'low' | 'medium' | 'high' {
  const lower = body.toLowerCase();
  if (lower.includes('critical') || lower.includes('🔴')) return 'high';
  if (lower.includes('major') || lower.includes('🟠')) return 'medium';
  return 'low';
}

function meetsMinSeverity(threadBody: string, minSeverity: string): boolean {
  const minLevel = SEVERITY_LEVELS[minSeverity] ?? 1;
  const threadLevel = SEVERITY_LEVELS[parseSeverityFromBody(threadBody)] ?? 1;
  return threadLevel >= minLevel;
}

export function createResolvePRThreadsHandler(_events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prNumber, minSeverity = 'low' } = req.body as ResolvePRThreadsRequest;

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

      // Validate prNumber is a safe integer before any shell interpolation
      assertSafeShellInteger(prNumber, 'resolve-pr-threads');

      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote || !remoteStatus.owner || !remoteStatus.repo) {
        res.status(400).json({ success: false, error: 'Project does not have a GitHub remote' });
        return;
      }

      const { owner, repo } = remoteStatus;

      logger.info(
        `Resolving review threads for PR #${prNumber} in ${owner}/${repo} (minSeverity: ${minSeverity})`
      );

      // Step 1: Fetch review threads using reviewThreads (returns PRRT_ node IDs, not PRRC_)
      const threadsQuery = `{
        repository(owner: "${owner}", name: "${repo}") {
          pullRequest(number: ${prNumber}) {
            reviewThreads(first: 100) {
              nodes {
                id
                isResolved
                comments(first: 1) {
                  nodes {
                    author { login }
                    body
                  }
                }
              }
            }
          }
        }
      }`.replace(/\n\s*/g, ' ');

      const { stdout: threadsOutput } = await execAsync(
        `gh api graphql -f query='${threadsQuery}'`,
        { cwd: projectPath, env: execEnv }
      );

      const threadsData = JSON.parse(threadsOutput);
      const allThreads: Array<{
        id: string;
        isResolved: boolean;
        comments: { nodes: Array<{ author: { login: string }; body: string }> };
      }> = threadsData.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];

      logger.debug(`Fetched ${allThreads.length} review threads for PR #${prNumber}`);

      // Step 2: Filter to unresolved threads that meet severity gate
      const unresolvedThreads = allThreads.filter((t) => {
        if (t.isResolved) return false;
        if (minSeverity === 'low') return true; // resolve all when no gate
        const firstBody = t.comments.nodes[0]?.body ?? '';
        return meetsMinSeverity(firstBody, minSeverity);
      });

      const skippedCount =
        allThreads.filter((t) => !t.isResolved).length - unresolvedThreads.length;

      logger.info(
        `${unresolvedThreads.length} threads to resolve, ${skippedCount} skipped by severity gate`
      );

      // Step 3: Resolve each thread via GraphQL mutation
      let resolvedCount = 0;
      const errors: string[] = [];

      for (const thread of unresolvedThreads) {
        try {
          const mutation = `mutation { resolveReviewThread(input: { threadId: "${thread.id}" }) { thread { id isResolved } } }`;
          await execAsync(`gh api graphql -f query='${mutation}'`, {
            cwd: projectPath,
            env: execEnv,
          });
          resolvedCount++;
          logger.debug(`Resolved thread ${thread.id}`);
        } catch (err) {
          const msg = getErrorMessage(err);
          logger.warn(`Failed to resolve thread ${thread.id}: ${msg}`);
          errors.push(`${thread.id}: ${msg}`);
        }
      }

      res.json({
        success: true,
        resolvedCount,
        skippedCount,
        totalUnresolved: allThreads.filter((t) => !t.isResolved).length,
        ...(errors.length > 0 && { errors }),
      });
    } catch (error) {
      logError(error, 'Resolve PR threads failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
