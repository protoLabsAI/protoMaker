/**
 * CodeRabbit Resolver Service - Automatically resolve bot-created review threads
 *
 * Resolves review threads created by known bot accounts (coderabbitai, github-actions)
 * using GitHub's GraphQL resolveReviewThread mutation. This service runs after CI passes
 * and before auto-merge attempts to clear bot review threads that don't require human action.
 *
 * Only resolves threads created by bots - human review threads are left untouched.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';

const execAsync = promisify(exec);
const logger = createLogger('CodeRabbitResolver');

// Extended PATH for finding gh CLI (same pattern as git-workflow-service)
const pathSeparator = process.platform === 'win32' ? ';' : ':';
const additionalPaths: string[] = [];

if (process.platform === 'win32') {
  if (process.env.LOCALAPPDATA) {
    additionalPaths.push(`${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd`);
  }
  if (process.env.PROGRAMFILES) {
    additionalPaths.push(`${process.env.PROGRAMFILES}\\Git\\cmd`);
  }
  if (process.env['ProgramFiles(x86)']) {
    additionalPaths.push(`${process.env['ProgramFiles(x86)']}\\Git\\cmd`);
  }
} else {
  additionalPaths.push(
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    `${process.env.HOME}/.local/bin`
  );
}

const extendedPath = [process.env.PATH, ...additionalPaths.filter(Boolean)]
  .filter(Boolean)
  .join(pathSeparator);

const execEnv = {
  ...process.env,
  PATH: extendedPath,
};

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
      // Extract owner/repo from the repo parameter or from git remote
      let owner: string;
      let repoName: string;

      if (repo) {
        [owner, repoName] = repo.split('/');
      } else {
        // Get from git remote
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

        [, owner, repoName] = match;
      }

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
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const { stdout } = await execAsync(`gh api graphql -f query='${query.replace(/\n/g, ' ')}'`, {
        cwd: workDir,
        env: execEnv,
      });

      const data = JSON.parse(stdout);
      const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

      return threads.map(
        (thread: {
          id: string;
          isResolved: boolean;
          comments: { nodes: Array<{ author: { login: string } }> };
        }) => {
          const author = thread.comments?.nodes?.[0]?.author;
          const isBot = author ? this.isBotAccount(author.login) : false;

          return {
            id: thread.id,
            isResolved: thread.isResolved,
            author,
            isBot,
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

      await execAsync(`gh api graphql -f query='${mutation.replace(/\n/g, ' ')}'`, {
        env: execEnv,
      });

      return true;
    } catch (error) {
      logger.error(`Failed to resolve review thread ${threadId}:`, error);
      return false;
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

      logger.info(
        `Found ${unresolvedBotThreads.length} unresolved bot threads and ${humanThreads.length} human threads`
      );

      if (unresolvedBotThreads.length === 0) {
        return {
          success: true,
          resolvedCount: 0,
          skippedCount: humanThreads.length,
          totalThreads,
        };
      }

      // Resolve bot threads
      let resolvedCount = 0;
      for (const thread of unresolvedBotThreads) {
        const resolved = await this.resolveThread(thread.id);
        if (resolved) {
          resolvedCount++;
          logger.debug(
            `Resolved bot thread from ${thread.author?.login || 'unknown'}: ${thread.id}`
          );
        }
      }

      logger.info(
        `Resolved ${resolvedCount}/${unresolvedBotThreads.length} bot review threads for PR #${prNumber}`
      );

      return {
        success: true,
        resolvedCount,
        skippedCount: humanThreads.length,
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
