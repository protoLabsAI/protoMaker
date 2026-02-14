/**
 * Labs Service - Manages the ./labs/ directory for cloning and managing repositories
 *
 * Provides functionality to:
 * - Clone git repositories to ./labs/{repo-name}/
 * - List cloned repositories
 * - Cleanup and refresh existing clones
 * - Handle duplicate detection and refresh
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger } from '@automaker/utils';

const execFileAsync = promisify(execFile);
const logger = createLogger('LabsService');

export interface CloneOptions {
  /** Git repository URL */
  gitUrl: string;
  /** Directory name (defaults to extracted repo name) */
  directoryName?: string;
  /** Perform shallow clone (--depth 1) for speed */
  shallow?: boolean;
  /** Base labs directory (defaults to ./labs) */
  labsDir?: string;
}

export interface CloneResult {
  success: boolean;
  path?: string;
  wasRefreshed?: boolean;
  branch?: string;
  error?: string;
}

export interface ListLabsResult {
  repos: Array<{
    name: string;
    path: string;
    branch?: string;
    lastModified?: Date;
  }>;
}

/**
 * Extract repository name from git URL
 * Examples:
 *   https://github.com/user/repo.git -> repo
 *   git@github.com:user/repo.git -> repo
 *   https://github.com/user/repo -> repo
 */
function extractRepoName(gitUrl: string): string {
  // Remove .git suffix if present
  let normalized = gitUrl.replace(/\.git$/, '');

  // Extract last path segment
  const match = normalized.match(/\/([^/]+)$/);
  if (!match) {
    throw new Error(`Could not extract repository name from URL: ${gitUrl}`);
  }

  return match[1];
}

/**
 * Validate git URL format
 */
function isValidGitUrl(url: string): boolean {
  // Support https://, git@, and git://
  return /^(https?:\/\/|git@|git:\/\/)/.test(url);
}

/**
 * Redact embedded credentials from git URLs for safe logging
 * e.g., https://user:token@github.com/repo → https://***@github.com/repo
 */
function redactGitUrl(url: string): string {
  return url.replace(/:\/\/[^@]+@/, '://***@');
}

/**
 * Get the default branch name for a repository
 */
async function getDefaultBranch(repoPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: repoPath,
    });
    // Output format: refs/remotes/origin/main
    const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)/);
    return match?.[1];
  } catch (error) {
    logger.warn('Could not determine default branch', { error });
    return undefined;
  }
}

/**
 * Get current branch name
 */
async function getCurrentBranch(repoPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], {
      cwd: repoPath,
    });
    return stdout.trim();
  } catch (error) {
    logger.warn('Could not determine current branch', { error });
    return undefined;
  }
}

export class LabsService {
  private defaultLabsDir: string;

  constructor(baseDir?: string) {
    // Default to ./labs relative to current working directory
    this.defaultLabsDir = baseDir || path.join(process.cwd(), 'labs');
  }

  /**
   * Ensure labs directory exists
   */
  private async ensureLabsDir(labsDir: string): Promise<void> {
    try {
      await fs.mkdir(labsDir, { recursive: true });
      logger.info('Labs directory ensured', { labsDir });
    } catch (error) {
      logger.error('Failed to create labs directory', { labsDir, error });
      throw new Error(
        `Failed to create labs directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if a repository already exists in labs
   */
  private async repoExists(repoPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(repoPath);
      if (!stat.isDirectory()) {
        return false;
      }

      // Check if it's a git repository
      const gitDir = path.join(repoPath, '.git');
      const gitStat = await fs.stat(gitDir);
      return gitStat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Refresh an existing repository with git pull --rebase
   */
  private async refreshRepo(repoPath: string): Promise<void> {
    logger.info('Refreshing existing repository', { repoPath });

    try {
      // Fetch latest changes
      await execFileAsync('git', ['fetch', '--all'], { cwd: repoPath });

      // Pull with rebase
      await execFileAsync('git', ['pull', '--rebase'], { cwd: repoPath });

      logger.info('Repository refreshed successfully', { repoPath });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to refresh repository', { repoPath, error: errorMessage });
      throw new Error(`Failed to refresh repository: ${errorMessage}`);
    }
  }

  /**
   * Clone a repository to the labs directory
   */
  async cloneRepo(options: CloneOptions): Promise<CloneResult> {
    const { gitUrl, directoryName, shallow = true, labsDir = this.defaultLabsDir } = options;

    // Validate git URL
    if (!isValidGitUrl(gitUrl)) {
      return {
        success: false,
        error: 'Invalid git URL format. Must start with https://, git@, or git://',
      };
    }

    // Extract repository name
    let repoName: string;
    try {
      repoName = directoryName || extractRepoName(gitUrl);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract repository name',
      };
    }

    // Block path traversal in directory name
    if (repoName.includes('..') || repoName.includes('/') || repoName.includes('\\')) {
      return {
        success: false,
        error: 'Invalid directory name: must not contain path separators or traversal sequences',
      };
    }

    // Ensure labs directory exists
    try {
      await this.ensureLabsDir(labsDir);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create labs directory',
      };
    }

    const repoPath = path.join(labsDir, repoName);

    // Check if repository already exists
    const exists = await this.repoExists(repoPath);
    if (exists) {
      logger.info('Repository already exists, refreshing', { repoPath });

      try {
        await this.refreshRepo(repoPath);
        const branch = await getCurrentBranch(repoPath);

        return {
          success: true,
          path: repoPath,
          wasRefreshed: true,
          branch,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to refresh existing repository',
        };
      }
    }

    // Clone the repository
    logger.info('Cloning repository', { gitUrl: redactGitUrl(gitUrl), repoPath, shallow });

    try {
      const cloneArgs = ['clone', ...(shallow ? ['--depth', '1'] : []), gitUrl, repoName];

      await execFileAsync('git', cloneArgs, { cwd: labsDir });

      // Get branch information
      const branch = (await getCurrentBranch(repoPath)) || (await getDefaultBranch(repoPath));

      logger.info('Repository cloned successfully', { repoPath, branch });

      return {
        success: true,
        path: repoPath,
        wasRefreshed: false,
        branch,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to clone repository', {
        gitUrl: redactGitUrl(gitUrl),
        error: errorMessage,
      });

      // Check for common error types
      if (
        errorMessage.includes('Authentication failed') ||
        errorMessage.includes('Permission denied')
      ) {
        return {
          success: false,
          error: 'Authentication failed. Check your git credentials and repository access.',
        };
      }

      if (errorMessage.includes('not found') || errorMessage.includes('Repository not found')) {
        return {
          success: false,
          error: 'Repository not found. Check the URL and ensure the repository exists.',
        };
      }

      if (errorMessage.includes('No space left on device')) {
        return {
          success: false,
          error: 'Insufficient disk space to clone repository.',
        };
      }

      return {
        success: false,
        error: `Failed to clone repository: ${errorMessage}`,
      };
    }
  }

  /**
   * List all cloned repositories in the labs directory
   */
  async listRepos(labsDir: string = this.defaultLabsDir): Promise<ListLabsResult> {
    try {
      // Check if labs directory exists
      try {
        await fs.access(labsDir);
      } catch {
        // Labs directory doesn't exist yet
        return { repos: [] };
      }

      const entries = await fs.readdir(labsDir, { withFileTypes: true });
      const repos = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const repoPath = path.join(labsDir, entry.name);
        const isRepo = await this.repoExists(repoPath);

        if (!isRepo) {
          continue;
        }

        // Get branch information
        const branch = await getCurrentBranch(repoPath);

        // Get last modified time
        let lastModified: Date | undefined;
        try {
          const stat = await fs.stat(repoPath);
          lastModified = stat.mtime;
        } catch {
          // Ignore errors getting stat
        }

        repos.push({
          name: entry.name,
          path: repoPath,
          branch,
          lastModified,
        });
      }

      return { repos };
    } catch (error) {
      logger.error('Failed to list repositories', { labsDir, error });
      throw new Error(
        `Failed to list repositories: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Cleanup a specific repository (delete it)
   */
  async cleanupRepo(repoName: string, labsDir: string = this.defaultLabsDir): Promise<boolean> {
    const repoPath = path.join(labsDir, repoName);

    try {
      // Check if repository exists
      const exists = await this.repoExists(repoPath);
      if (!exists) {
        logger.warn('Repository does not exist', { repoPath });
        return false;
      }

      // Delete the repository directory
      await fs.rm(repoPath, { recursive: true, force: true });

      logger.info('Repository deleted successfully', { repoPath });
      return true;
    } catch (error) {
      logger.error('Failed to delete repository', { repoPath, error });
      throw new Error(
        `Failed to delete repository: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Export singleton instance
export const labsService = new LabsService();
