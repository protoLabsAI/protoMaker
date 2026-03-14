/**
 * CodeRabbit Resolver Service - Automatically resolve bot-created review threads
 *
 * Resolves review threads created by known bot accounts (coderabbitai, github-actions)
 * using GitHub's GraphQL resolveReviewThread mutation. This service runs after CI passes
 * and before auto-merge attempts to clear bot review threads that don't require human action.
 *
 * Only resolves threads created by bots - human review threads are left untouched.
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import { createGitExecEnv } from '@protolabsai/git-utils';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const logger = createLogger('CodeRabbitResolver');

const execEnv = createGitExecEnv();

/**
 * Known bot accounts whose review threads should be auto-resolved
 */
const KNOWN_BOT_ACCOUNTS = [
  'coderabbitai',
  'github-actions',
  'github-actions[bot]',
  'dependabot',
  'dependabot[bot]',
  'renovate',
  'renovate[bot]',
];

/**
 * ReviewThread - Information about a GitHub review thread
 */
interface ReviewThread {
  /** GraphQL node ID for the thread */
  id: string;
  /** Whether the thread is resolved */
  isResolved: boolean;
  /** Author of the first comment in the thread */
  author?: {
    login: string;
  };
  /** Whether this thread was created by a bot */
  isBot: boolean;
  /** Severity level parsed from the comment (critical threads should not be auto-resolved) */
  severity?: 'critical' | 'warning' | 'suggestion' | 'info';
}

/**
 * ResolveThreadsResult - Result of resolving review threads
 */
export interface ResolveThreadsResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Number of threads that were resolved */
  resolvedCount: number;
  /** Number of threads that were skipped (human threads) */
  skippedCount: number;
  /** Total number of threads checked */
  totalThreads: number;
  /** Error message if operation failed */
  error?: string;
}

export class CodeRabbitResolverService {
  /**
   * Parse GitHub owner and repo name from a repo string or git remote URL
   */
  private async parseOwnerRepo(
    workDir: string,
    repo?: string
  ): Promise<{ owner: string; repoName: string }> {
    if (repo) {
      const [owner, repoName] = repo.split('/');
      return { owner, repoName };
    }

    const { stdout: remoteOutput } = await execAsync('git remote get-url origin', {
      cwd: workDir,
      env: execEnv,
    });

    const remoteUrl = remoteOutput.trim();
    const match =
      remoteUrl.match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/) ||
      remoteUrl.match(/^([^/]+)\/([^/\s]+)$/);

    if (!match) {
      throw new Error(`Could not parse GitHub owner/repo from remote: ${remoteUrl}`);
    }

    return { owner: match[1], repoName: match[2] };
  }

  /**
   * Check if gh CLI is available
   */
  private async isGhCliAvailable(): Promise<boolean> {
    try {
      const checkCommand = process.platform === 'win32' ? 'where gh' : 'command -v gh';
      await execAsync(checkCommand, { env: execEnv });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a login belongs to a bot account
   */
  private isBotAccount(login: string): boolean {
    const lowerLogin = login.toLowerCase();
    return KNOWN_BOT_ACCOUNTS.some((bot) => lowerLogin.includes(bot.toLowerCase()));
  }

  /**
   * Parse severity from comment body
   * Looks for severity markers like **Severity**: critical or emoji indicators
   */
  private parseSeverity(body: string): 'critical' | 'warning' | 'suggestion' | 'info' {
    // Extract severity from explicit marker
    const severityMatch = body.match(/\*\*Severity\*\*:\s*(\w+)/i);
    if (severityMatch) {
      const sev = severityMatch[1].toLowerCase();
      if (sev === 'critical' || sev === 'high') return 'critical';
      if (sev === 'warning' || sev === 'medium') return 'warning';
      if (sev === 'suggestion' || sev === 'low') return 'suggestion';
    }

    // Infer from emoji
    if (body.includes('🚨')) return 'critical';
    if (body.includes('⚠️')) return 'warning';
    if (body.includes('💡')) return 'suggestion';

    return 'info';
  }

  /**
   * Get review threads for a PR using GitHub GraphQL API
   *
   * @param workDir - Working directory containing the repository
   * @param prNumber - PR number to get threads for
   * @param repo - Optional repository in owner/repo format
   * @returns Array of review threads
   */
  private async getReviewThreads(
    workDir: string,
    prNumber: number,
    repo?: string
  ): Promise<ReviewThread[]> {
    try {
      const { owner, repoName } = await this.parseOwnerRepo(workDir, repo);

      // Query review threads using GraphQL
      const query = `
        query {
          repository(owner: "${owner}", name: "${repoName}") {
            pullRequest(number: ${prNumber}) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 1) {
                    nodes {
                      author {
                        login
                      }
                      body
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const { stdout } = await execFileAsync('gh', ['api', 'graphql', '-f', `query=${query}`], {
        cwd: workDir,
        env: execEnv,
      });

      const data = JSON.parse(stdout);
      const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

      return threads.map(
        (thread: {
          id: string;
          isResolved: boolean;
          comments: { nodes: Array<{ author: { login: string }; body?: string }> };
        }) => {
          const firstComment = thread.comments?.nodes?.[0];
          const author = firstComment?.author;
          const isBot = author ? this.isBotAccount(author.login) : false;

          // Parse severity from comment body
          let severity: 'critical' | 'warning' | 'suggestion' | 'info' = 'info';
          if (firstComment?.body) {
            severity = this.parseSeverity(firstComment.body);
          }

          return {
            id: thread.id,
            isResolved: thread.isResolved,
            author,
            isBot,
            severity,
          };
        }
      );
    } catch (error) {
      logger.error(`Failed to get review threads for PR #${prNumber}:`, error);
      throw error;
    }
  }

  /**
   * Resolve a single review thread using GraphQL mutation
   *
   * @param threadId - GraphQL node ID of the thread to resolve
   * @returns Whether the resolution succeeded
   */
  private async resolveThread(threadId: string): Promise<boolean> {
    try {
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

      await execFileAsync('gh', ['api', 'graphql', '-f', `query=${mutation}`], {
        env: execEnv,
      });

      return true;
    } catch (error) {
      logger.error(`Failed to resolve review thread ${threadId}:`, error);
      return false;
    }
  }

  /**
   * Post a reply comment on a review thread and then resolve it
   *
   * @param threadId - GraphQL node ID of the thread
   * @param pullRequestId - GraphQL node ID of the pull request
   * @param body - The comment body to post
   * @returns Whether the operation succeeded
   */
  async replyAndResolveThread(
    threadId: string,
    pullRequestId: string,
    body: string
  ): Promise<boolean> {
    try {
      // First, post the reply comment
      // Use JSON.stringify slice to produce correct GraphQL string escaping
      const escapedBody = JSON.stringify(body).slice(1, -1);
      const addReplyMutation = `
        mutation {
          addPullRequestReviewThreadReply(input: {
            pullRequestReviewThreadId: "${threadId}",
            body: "${escapedBody}"
          }) {
            comment {
              id
            }
          }
        }
      `;

      await execFileAsync('gh', ['api', 'graphql', '-f', `query=${addReplyMutation}`], {
        env: execEnv,
      });

      logger.debug(`Posted reply comment on thread ${threadId}`);

      // Then resolve the thread
      const resolved = await this.resolveThread(threadId);
      if (resolved) {
        logger.debug(`Resolved thread ${threadId} after posting reply`);
      }

      return resolved;
    } catch (error) {
      logger.error(`Failed to reply and resolve thread ${threadId}:`, error);
      return false;
    }
  }

  /**
   * Get the PR GraphQL node ID from the PR number
   *
   * @param workDir - Working directory containing the repository
   * @param prNumber - PR number
   * @param repo - Optional repository in owner/repo format
   * @returns The GraphQL node ID of the PR
   */
  async getPullRequestId(workDir: string, prNumber: number, repo?: string): Promise<string | null> {
    try {
      const { owner, repoName } = await this.parseOwnerRepo(workDir, repo);

      // Query for PR node ID
      const query = `
        query {
          repository(owner: "${owner}", name: "${repoName}") {
            pullRequest(number: ${prNumber}) {
              id
            }
          }
        }
      `;

      const { stdout } = await execFileAsync('gh', ['api', 'graphql', '-f', `query=${query}`], {
        cwd: workDir,
        env: execEnv,
      });

      const data = JSON.parse(stdout);
      return data.data?.repository?.pullRequest?.id || null;
    } catch (error) {
      logger.error(`Failed to get PR ID for PR #${prNumber}:`, error);
      return null;
    }
  }

  /**
   * Resolve all bot-created review threads for a PR
   *
   * This method:
   * 1. Fetches all review threads for the PR
   * 2. Identifies threads created by bot accounts
   * 3. Resolves only bot threads, leaving human threads untouched
   *
   * @param workDir - Working directory containing the repository
   * @param prNumber - PR number to resolve threads for
   * @param repo - Optional repository in owner/repo format
   * @returns Result with count of resolved threads
   */
  async resolveThreads(
    workDir: string,
    prNumber: number,
    repo?: string
  ): Promise<ResolveThreadsResult> {
    // Check if gh CLI is available
    const ghAvailable = await this.isGhCliAvailable();
    if (!ghAvailable) {
      logger.warn('gh CLI not available, cannot resolve review threads');
      return {
        success: false,
        resolvedCount: 0,
        skippedCount: 0,
        totalThreads: 0,
        error: 'gh CLI not available',
      };
    }

    try {
      logger.info(`Checking review threads for PR #${prNumber}`);

      // Get all review threads
      const threads = await this.getReviewThreads(workDir, prNumber, repo);
      const totalThreads = threads.length;

      if (totalThreads === 0) {
        logger.info(`No review threads found for PR #${prNumber}`);
        return {
          success: true,
          resolvedCount: 0,
          skippedCount: 0,
          totalThreads: 0,
        };
      }

      // Filter for unresolved bot threads
      const unresolvedBotThreads = threads.filter((thread) => !thread.isResolved && thread.isBot);
      const humanThreads = threads.filter((thread) => !thread.isBot);

      // Filter out critical bot threads - they must NOT be auto-resolved
      const criticalBotThreads = unresolvedBotThreads.filter(
        (thread) => thread.severity === 'critical'
      );
      const resolvableBotThreads = unresolvedBotThreads.filter(
        (thread) => thread.severity !== 'critical'
      );

      logger.info(
        `Found ${unresolvedBotThreads.length} unresolved bot threads ` +
          `(${criticalBotThreads.length} critical, ${resolvableBotThreads.length} resolvable) ` +
          `and ${humanThreads.length} human threads`
      );

      if (criticalBotThreads.length > 0) {
        logger.warn(
          `Skipping ${criticalBotThreads.length} critical bot threads that require manual review`
        );
      }

      if (resolvableBotThreads.length === 0) {
        return {
          success: true,
          resolvedCount: 0,
          skippedCount: humanThreads.length + criticalBotThreads.length,
          totalThreads,
        };
      }

      // Resolve non-critical bot threads only
      let resolvedCount = 0;
      for (const thread of resolvableBotThreads) {
        const resolved = await this.resolveThread(thread.id);
        if (resolved) {
          resolvedCount++;
          logger.debug(
            `Resolved ${thread.severity} bot thread from ${thread.author?.login || 'unknown'}: ${thread.id}`
          );
        }
      }

      logger.info(
        `Resolved ${resolvedCount}/${resolvableBotThreads.length} resolvable bot review threads for PR #${prNumber} ` +
          `(${criticalBotThreads.length} critical threads skipped)`
      );

      return {
        success: true,
        resolvedCount,
        skippedCount: humanThreads.length + criticalBotThreads.length,
        totalThreads,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to resolve review threads for PR #${prNumber}: ${errorMsg}`);
      return {
        success: false,
        resolvedCount: 0,
        skippedCount: 0,
        totalThreads: 0,
        error: errorMsg,
      };
    }
  }
}

/**
 * Singleton instance
 */
export const codeRabbitResolverService = new CodeRabbitResolverService();
