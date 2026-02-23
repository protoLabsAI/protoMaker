/**
 * Prompt GitHub Sync Service
 *
 * Synchronizes prompt customizations to a GitHub repository using the REST API.
 * Creates or updates files at prompts/{category}/{key}.txt with proper commit messages.
 */

import { Octokit } from '@octokit/rest';
import { createLogger } from '@automaker/utils';

const logger = createLogger('PromptGitHubSync');

export interface PromptSyncOptions {
  /** GitHub repository owner */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** Branch to commit to (default: 'main') */
  branch?: string;
}

export interface PromptToSync {
  /** Prompt category (e.g., 'autoMode', 'agent') */
  category: string;
  /** Prompt key (e.g., 'planningLite', 'systemPrompt') */
  key: string;
  /** Prompt content to sync */
  content: string;
  /** Display name for commit message */
  name: string;
  /** Version for commit message */
  version: string;
}

export class PromptGitHubSyncService {
  private octokit: Octokit | null = null;
  private readonly options: PromptSyncOptions;

  constructor(options: PromptSyncOptions) {
    this.options = {
      ...options,
      branch: options.branch || 'main',
    };

    // Initialize Octokit if GITHUB_TOKEN is available
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      logger.warn('GITHUB_TOKEN not found in environment variables. Prompt sync will be skipped.');
      this.octokit = null;
    } else {
      this.octokit = new Octokit({
        auth: token,
      });
      logger.info('GitHub sync service initialized');
    }
  }

  /**
   * Check if the service is available (has valid token)
   */
  isAvailable(): boolean {
    return this.octokit !== null;
  }

  /**
   * Derive file path from prompt category and key
   * Example: category='autoMode', key='planningLite' → 'prompts/autoMode/planningLite.txt'
   */
  private getFilePath(category: string, key: string): string {
    return `prompts/${category}/${key}.txt`;
  }

  /**
   * Fetch the current SHA of a file if it exists in the repository
   * Returns null if the file doesn't exist (will be a new file)
   */
  private async fetchFileSha(path: string): Promise<string | null> {
    if (!this.octokit) {
      return null;
    }

    try {
      const response = await this.octokit.repos.getContent({
        owner: this.options.owner,
        repo: this.options.repo,
        path,
        ref: this.options.branch,
      });

      // Type guard: ensure response.data is not an array
      if (Array.isArray(response.data)) {
        logger.warn(`Expected file but got directory at path: ${path}`);
        return null;
      }

      // Type guard: ensure it's a file with sha
      if ('sha' in response.data) {
        return response.data.sha;
      }

      return null;
    } catch (error: unknown) {
      // If error is 404, file doesn't exist yet
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        logger.debug(`File not found at ${path}, will create new file`);
        return null;
      }

      // Other errors should be logged
      logger.error(`Error fetching file SHA for ${path}:`, error);
      return null;
    }
  }

  /**
   * Build a descriptive commit message
   * Format: 'prompt: update {name} v{version}'
   */
  private buildCommitMessage(name: string, version: string): string {
    return `prompt: update ${name} v${version}`;
  }

  /**
   * Sync a prompt to the GitHub repository
   * Creates a new file if it doesn't exist, updates if it does
   */
  async syncPrompt(prompt: PromptToSync): Promise<{ success: boolean; error?: string }> {
    // Check if service is available
    if (!this.octokit) {
      logger.warn('GitHub sync skipped: GITHUB_TOKEN not configured');
      return { success: false, error: 'GITHUB_TOKEN not configured' };
    }

    const filePath = this.getFilePath(prompt.category, prompt.key);
    const commitMessage = this.buildCommitMessage(prompt.name, prompt.version);

    try {
      // Fetch current file SHA (needed for updates)
      const sha = await this.fetchFileSha(filePath);

      // Encode content as base64
      const contentBase64 = Buffer.from(prompt.content).toString('base64');

      // Create or update the file
      const response = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.options.owner,
        repo: this.options.repo,
        path: filePath,
        message: commitMessage,
        content: contentBase64,
        branch: this.options.branch,
        ...(sha && { sha }), // Include SHA only if file exists (for updates)
      });

      if (sha) {
        logger.info(
          `Updated prompt at ${filePath} (commit: ${response.data.commit?.sha?.substring(0, 7)})`
        );
      } else {
        logger.info(
          `Created prompt at ${filePath} (commit: ${response.data.commit?.sha?.substring(0, 7)})`
        );
      }

      return { success: true };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to sync prompt to ${filePath}: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Sync multiple prompts in sequence
   * Returns summary of results
   */
  async syncPrompts(
    prompts: PromptToSync[]
  ): Promise<{ total: number; succeeded: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const prompt of prompts) {
      const result = await this.syncPrompt(prompt);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
        if (result.error) {
          errors.push(`${prompt.category}.${prompt.key}: ${result.error}`);
        }
      }
    }

    logger.info(`Synced ${prompts.length} prompts: ${succeeded} succeeded, ${failed} failed`);

    return {
      total: prompts.length,
      succeeded,
      failed,
      errors,
    };
  }
}

// Factory function to create service instance
export function createPromptGitHubSyncService(options: PromptSyncOptions): PromptGitHubSyncService {
  return new PromptGitHubSyncService(options);
}
