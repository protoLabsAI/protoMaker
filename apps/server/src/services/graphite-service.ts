/**
 * Graphite Service - Stack-aware PR management using Graphite CLI
 *
 * Provides integration with Graphite CLI (gt) for managing stacked PRs.
 * When enabled, replaces raw git/gh commands with Graphite equivalents
 * for better stack handling in the epic workflow.
 *
 * @see https://graphite.dev/docs/graphite-cli
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabs-ai/utils';
import type { GraphiteSettings } from '@protolabs-ai/types';
import { DEFAULT_GRAPHITE_SETTINGS } from '@protolabs-ai/types';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const logger = createLogger('GraphiteService');

// Extended PATH for finding gt CLI (same as git-workflow-service)
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
 * Retry configuration for Graphite commands
 */
interface RetryConfig {
  maxRetries: number;
  backoffMs: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffMs: [1000, 2000, 4000],
};

/**
 * Circuit breaker for Graphite operations.
 * Opens after consecutive failures, preventing cascading failures.
 */
class GraphiteCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private isOpen = false;
  private readonly failureThreshold = 3;
  private readonly cooldownMs = 60000; // 60 seconds

  /**
   * Check if the circuit breaker is currently open
   */
  isCircuitOpen(): boolean {
    // Auto-reset after cooldown period
    if (this.isOpen && Date.now() - this.lastFailureTime >= this.cooldownMs) {
      logger.info('Circuit breaker cooldown expired, resetting to closed state');
      this.reset();
      return false;
    }
    return this.isOpen;
  }

  /**
   * Record a successful operation - resets failure count
   */
  recordSuccess(): void {
    if (this.failureCount > 0 || this.isOpen) {
      logger.debug('Graphite operation succeeded, resetting circuit breaker');
    }
    this.failureCount = 0;
    this.isOpen = false;
  }

  /**
   * Record a failed operation - may open the circuit
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold && !this.isOpen) {
      this.isOpen = true;
      logger.warn(
        `Graphite circuit breaker opened after ${this.failureCount} consecutive failures. ` +
          `Will retry after ${this.cooldownMs}ms cooldown.`
      );
    } else if (!this.isOpen) {
      logger.debug(`Graphite failure ${this.failureCount}/${this.failureThreshold}`);
    }
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.failureCount = 0;
    this.isOpen = false;
  }

  /**
   * Get current circuit breaker state for logging
   */
  getState(): { isOpen: boolean; failureCount: number; timeSinceLastFailure: number } {
    return {
      isOpen: this.isOpen,
      failureCount: this.failureCount,
      timeSinceLastFailure: this.lastFailureTime ? Date.now() - this.lastFailureTime : 0,
    };
  }
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Result from a Graphite submit operation
 */
export interface GraphiteSubmitResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  error?: string;
}

/**
 * Information about a branch in the Graphite stack
 */
export interface GraphiteStackInfo {
  branch: string;
  parent: string | null;
  prNumber?: number;
  prUrl?: string;
  prStatus?: 'open' | 'merged' | 'closed';
}

/**
 * Result from Graphite sync operation
 */
export interface GraphiteSyncResult {
  success: boolean;
  rebased: boolean;
  conflicts: boolean;
  error?: string;
}

/**
 * GraphiteService - Wrapper for Graphite CLI commands
 *
 * Provides methods that mirror Graphite CLI functionality for:
 * - Branch tracking and stack management
 * - Commits with stack awareness
 * - PR creation and updates via stack submit
 * - Stack synchronization (rebasing on parent)
 */
export class GraphiteService {
  private cachedAvailability: boolean | null = null;
  private lastAvailabilityCheck = 0;
  private readonly AVAILABILITY_CACHE_MS = 60000; // 1 minute
  private circuitBreaker = new GraphiteCircuitBreaker();

  /**
   * Execute a Graphite command with retry logic and circuit breaker protection.
   *
   * @param command - The command to execute
   * @param workDir - Working directory for the command
   * @param retryConfig - Optional retry configuration
   * @returns Command output
   * @throws Error if circuit is open or all retries fail
   */
  private async executeWithRetry(
    command: string,
    workDir: string,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<{ stdout: string; stderr: string }> {
    // Check circuit breaker first
    if (this.circuitBreaker.isCircuitOpen()) {
      const state = this.circuitBreaker.getState();
      throw new Error(
        `Graphite circuit breaker is open (${state.failureCount} failures, ` +
          `${Math.round(state.timeSinceLastFailure / 1000)}s ago). ` +
          `Operations disabled for ${Math.round((60000 - state.timeSinceLastFailure) / 1000)}s.`
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`Retry attempt ${attempt + 1}/${retryConfig.maxRetries} for: ${command}`);
        }

        const result = await execAsync(command, { cwd: workDir, env: execEnv });

        // Success - record it and return
        this.circuitBreaker.recordSuccess();

        if (attempt > 0) {
          logger.info(`Command succeeded on retry attempt ${attempt + 1}`);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check for merge conflicts - don't retry these
        const errorMsg = lastError.message.toLowerCase();
        if (errorMsg.includes('conflict')) {
          logger.warn(`Conflict detected in graphite command: ${command}. Not retrying.`);
          throw lastError;
        }

        // Record failure for circuit breaker
        this.circuitBreaker.recordFailure();

        // If this isn't the last attempt, wait before retrying
        if (attempt < retryConfig.maxRetries - 1) {
          const backoffMs =
            retryConfig.backoffMs[attempt] ||
            retryConfig.backoffMs[retryConfig.backoffMs.length - 1];
          logger.warn(
            `Graphite command failed (attempt ${attempt + 1}/${retryConfig.maxRetries}): ${lastError.message}. ` +
              `Retrying in ${backoffMs}ms...`
          );
          await sleep(backoffMs);
        }
      }
    }

    // All retries exhausted
    const state = this.circuitBreaker.getState();
    logger.error(
      `Graphite command failed after ${retryConfig.maxRetries} attempts: ${command}. ` +
        `Circuit breaker state: ${state.isOpen ? 'OPEN' : 'CLOSED'} (${state.failureCount} failures)`
    );

    throw lastError || new Error('Command failed with unknown error');
  }

  /**
   * Check if Graphite CLI (gt) is available on the system
   * Results are cached for performance
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (
      this.cachedAvailability !== null &&
      now - this.lastAvailabilityCheck < this.AVAILABILITY_CACHE_MS
    ) {
      return this.cachedAvailability;
    }

    try {
      const checkCommand = process.platform === 'win32' ? 'where gt' : 'command -v gt';
      await execAsync(checkCommand, { env: execEnv });
      this.cachedAvailability = true;
      this.lastAvailabilityCheck = now;
      logger.debug('Graphite CLI (gt) is available');
      return true;
    } catch {
      this.cachedAvailability = false;
      this.lastAvailabilityCheck = now;
      logger.debug('Graphite CLI (gt) is not available');
      return false;
    }
  }

  /**
   * Check if Graphite is available and enabled for use
   */
  async shouldUseGraphite(settings?: GraphiteSettings): Promise<boolean> {
    const graphiteSettings = settings ?? DEFAULT_GRAPHITE_SETTINGS;
    if (!graphiteSettings.enabled) {
      return false;
    }
    return this.isAvailable();
  }

  /**
   * Track a branch in Graphite stack
   * This establishes the parent relationship for stack-aware PRs
   *
   * @param workDir - Working directory (worktree path)
   * @param branchName - Branch to track
   * @param parentBranch - Optional parent branch (defaults to Graphite's auto-detection)
   */
  async trackBranch(workDir: string, branchName: string, parentBranch?: string): Promise<boolean> {
    try {
      // First check if branch is already tracked
      const { stdout: logOutput } = await execAsync('gt log --json', {
        cwd: workDir,
        env: execEnv,
      }).catch(() => ({ stdout: '[]' }));

      try {
        const stack = JSON.parse(logOutput);
        const alreadyTracked = stack.some(
          (entry: { branch?: string }) => entry.branch === branchName
        );
        if (alreadyTracked) {
          logger.debug(`Branch ${branchName} is already tracked in Graphite`);
          return true;
        }
      } catch {
        // JSON parse failed, continue with tracking
      }

      // Track the branch with optional parent
      // --force auto-selects nearest tracked ancestor (main) to avoid interactive prompts
      let trackCmd = `gt track`;
      if (parentBranch) {
        trackCmd += ` --parent "${parentBranch}"`;
      } else {
        trackCmd += ` --force`;
      }

      await execAsync(trackCmd, { cwd: workDir, env: execEnv });
      logger.info(
        `Tracked branch ${branchName} in Graphite${parentBranch ? ` with parent ${parentBranch}` : ''}`
      );
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to track branch ${branchName} in Graphite: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Create a new branch using Graphite
   * This automatically tracks the branch with the current branch as parent
   *
   * @param workDir - Working directory
   * @param branchName - Name for the new branch
   */
  async createBranch(workDir: string, branchName: string): Promise<boolean> {
    try {
      await execAsync(`gt branch create "${branchName}"`, {
        cwd: workDir,
        env: execEnv,
      });
      logger.info(`Created Graphite branch: ${branchName}`);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to create Graphite branch ${branchName}: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Commit changes using Graphite
   * This updates the stack metadata automatically
   *
   * @param workDir - Working directory
   * @param message - Commit message
   * @returns Commit hash if successful, null otherwise
   */
  async commit(workDir: string, message: string): Promise<string | null> {
    try {
      // Stage all changes first
      await execAsync("git add -A -- ':(exclude).automaker/'", { cwd: workDir, env: execEnv });

      // Check for changes
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: workDir,
        env: execEnv,
      });

      if (!status.trim()) {
        return null; // No changes to commit
      }

      // Use gt commit - it handles stack metadata
      // Use execFile to pass the message as an argument directly, avoiding shell
      // interpolation issues with newlines and special characters.
      await execFileAsync('gt', ['commit', '-m', message], {
        cwd: workDir,
        env: execEnv,
      });

      // Get commit hash
      const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: workDir,
        env: execEnv,
      });

      return hashOutput.trim().substring(0, 8);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Graphite commit failed: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Push the current branch using Graphite
   * This handles force-push with lease for rebased stacks
   */
  async push(workDir: string): Promise<boolean> {
    try {
      // gt push handles force-push-with-lease automatically for rebased stacks
      await execAsync('gt push', { cwd: workDir, env: execEnv });
      logger.info('Graphite push successful');
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Graphite push failed: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Submit (create/update) a PR for the current branch using Graphite
   * Graphite automatically handles the base branch based on stack parent
   *
   * @param workDir - Working directory
   * @param title - PR title
   * @param body - PR body/description
   */
  async submit(workDir: string, title: string, body: string): Promise<GraphiteSubmitResult> {
    try {
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedBody = body.replace(/"/g, '\\"');

      // gt submit creates or updates the PR
      // --no-edit prevents opening an editor
      const { stdout } = await execAsync(
        `gt submit --title "${escapedTitle}" --body "${escapedBody}" --no-edit`,
        { cwd: workDir, env: execEnv }
      );

      // Parse PR URL from output
      const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
      const prUrl = urlMatch ? urlMatch[0] : undefined;

      // Extract PR number from URL
      let prNumber: number | undefined;
      if (prUrl) {
        const numberMatch = prUrl.match(/\/pull\/(\d+)/);
        if (numberMatch) {
          prNumber = parseInt(numberMatch[1], 10);
        }
      }

      logger.info(`Graphite submit successful: ${prUrl || 'PR created/updated'}`);
      return { success: true, prUrl, prNumber };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if PR already exists
      if (errorMsg.includes('already has a PR')) {
        // Try to get existing PR info
        const prInfo = await this.getPRInfo(workDir);
        if (prInfo) {
          return {
            success: true,
            prUrl: prInfo.prUrl,
            prNumber: prInfo.prNumber,
          };
        }
      }

      logger.warn(`Graphite submit failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Submit all PRs in the stack at once
   * Useful for epic workflows where multiple features branch off an epic
   */
  async stackSubmit(workDir: string): Promise<GraphiteSubmitResult> {
    try {
      const { stdout } = await execAsync('gt stack submit --no-edit', {
        cwd: workDir,
        env: execEnv,
      });

      logger.info('Graphite stack submit successful');

      // Parse any PR URLs from output
      const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
      return {
        success: true,
        prUrl: urlMatch ? urlMatch[0] : undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Graphite stack submit failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Sync the current branch with its parent (rebase)
   * This is the Graphite equivalent of git pull --rebase
   */
  async sync(workDir: string): Promise<GraphiteSyncResult> {
    try {
      await this.executeWithRetry('gt sync --force', workDir);
      logger.info('Graphite sync successful');
      return { success: true, rebased: true, conflicts: false };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check for merge conflicts (don't retry conflicts)
      if (errorMsg.includes('conflict') || errorMsg.includes('CONFLICT')) {
        logger.warn('Graphite sync encountered conflicts');
        return { success: false, rebased: false, conflicts: true, error: errorMsg };
      }

      // Check if circuit breaker is open
      if (errorMsg.includes('circuit breaker is open')) {
        logger.warn('Graphite sync blocked by circuit breaker');
        return { success: false, rebased: false, conflicts: false, error: errorMsg };
      }

      logger.warn(`Graphite sync failed: ${errorMsg}`);
      return { success: false, rebased: false, conflicts: false, error: errorMsg };
    }
  }

  /**
   * Sync and restack the current branch with its parent.
   * This is a convenience method that wraps sync() with proper availability checks.
   *
   * Use this before starting agent work to ensure the branch is fresh.
   *
   * @param workDir - Working directory (worktree path)
   * @param branchName - Branch name being synced (for logging)
   * @returns GraphiteSyncResult with success status and conflict information
   */
  async syncAndRestack(workDir: string, branchName?: string): Promise<GraphiteSyncResult> {
    const branchInfo = branchName ? ` for branch ${branchName}` : '';

    // Check if Graphite is available
    const available = await this.isAvailable();
    if (!available) {
      logger.debug(`Graphite CLI not available, skipping sync${branchInfo}`);
      return {
        success: false,
        rebased: false,
        conflicts: false,
        error: 'Graphite CLI not available',
      };
    }

    logger.info(`Syncing and restacking${branchInfo}...`);
    const result = await this.sync(workDir);

    if (result.success) {
      logger.info(`Successfully synced and restacked${branchInfo}`);
    } else if (result.conflicts) {
      logger.warn(`Sync encountered conflicts${branchInfo}: ${result.error}`);
    } else {
      logger.warn(`Sync failed${branchInfo}: ${result.error}`);
    }

    return result;
  }

  /**
   * Restack the entire branch stack on top of the trunk
   * This rebases all branches in the stack when the trunk (main) has changed
   * Use this to keep feature branches up to date with main and prevent merge conflicts
   *
   * @param workDir - Working directory (worktree path)
   * @returns Result indicating success, conflicts, or other errors
   */
  async restack(workDir: string): Promise<GraphiteSyncResult> {
    try {
      await this.executeWithRetry('gt restack', workDir);
      logger.info('Graphite restack successful');
      return { success: true, rebased: true, conflicts: false };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check for merge conflicts (don't retry conflicts)
      if (errorMsg.includes('conflict') || errorMsg.includes('CONFLICT')) {
        logger.warn('Graphite restack encountered conflicts');
        return { success: false, rebased: false, conflicts: true, error: errorMsg };
      }

      // Check if circuit breaker is open
      if (errorMsg.includes('circuit breaker is open')) {
        logger.warn('Graphite restack blocked by circuit breaker');
        return { success: false, rebased: false, conflicts: false, error: errorMsg };
      }

      logger.warn(`Graphite restack failed: ${errorMsg}`);
      return { success: false, rebased: false, conflicts: false, error: errorMsg };
    }
  }

  /**
   * Get stack information for the current branch
   * Returns information about the branch's position in the stack
   */
  async getStackInfo(workDir: string): Promise<GraphiteStackInfo[]> {
    try {
      const { stdout } = await execAsync('gt log --json', {
        cwd: workDir,
        env: execEnv,
      });

      const stack = JSON.parse(stdout);

      // Transform to our interface
      return stack.map(
        (entry: {
          branch?: string;
          parent?: string;
          prNumber?: number;
          prUrl?: string;
          prStatus?: string;
        }) => ({
          branch: entry.branch || '',
          parent: entry.parent || null,
          prNumber: entry.prNumber,
          prUrl: entry.prUrl,
          prStatus: entry.prStatus as 'open' | 'merged' | 'closed' | undefined,
        })
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.debug(`Could not get Graphite stack info: ${errorMsg}`);
      return [];
    }
  }

  /**
   * Get PR info for the current branch
   */
  async getPRInfo(workDir: string): Promise<{ prUrl?: string; prNumber?: number } | null> {
    try {
      const { stdout } = await execAsync('gt pr view --json', {
        cwd: workDir,
        env: execEnv,
      });

      const prData = JSON.parse(stdout);
      return {
        prUrl: prData.url,
        prNumber: prData.number,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if the current repository is initialized with Graphite
   */
  async isRepoInitialized(workDir: string): Promise<boolean> {
    try {
      // gt repo init status or just try to run gt log
      await execAsync('gt log --json', { cwd: workDir, env: execEnv });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize Graphite in the repository if not already initialized
   * This is required before using gt commands in a new repo
   */
  async initializeRepo(workDir: string, trunk?: string): Promise<boolean> {
    try {
      const trunkArg = trunk ? ` --trunk "${trunk}"` : '';
      await execAsync(`gt repo init${trunkArg}`, { cwd: workDir, env: execEnv });
      logger.info('Graphite repo initialized');
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Already initialized is not an error
      if (errorMsg.includes('already initialized')) {
        return true;
      }
      logger.warn(`Failed to initialize Graphite repo: ${errorMsg}`);
      return false;
    }
  }
}

// Export singleton instance
export const graphiteService = new GraphiteService();
