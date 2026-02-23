/**
 * Prompt CI Trigger Service
 *
 * Fires repository_dispatch events to trigger CI workflows when prompts are
 * committed to GitHub, controlled by LANGFUSE_SYNC_CI_TRIGGER environment variable.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';

const execAsync = promisify(exec);
const logger = createLogger('PromptCITrigger');

// Extended PATH for finding gh CLI (same pattern as github-merge-service)
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
 * Check if gh CLI is available on the system
 */
async function isGhCliAvailable(): Promise<boolean> {
  try {
    const checkCommand = process.platform === 'win32' ? 'where gh' : 'command -v gh';
    await execAsync(checkCommand, { env: execEnv });
    return true;
  } catch {
    return false;
  }
}

/**
 * Prompt payload for CI trigger
 */
export interface PromptPayload {
  /** Prompt name */
  name: string;
  /** Prompt version */
  version: string | number;
  /** Prompt labels (optional) */
  labels?: string[];
  /** Action performed (e.g., 'created', 'updated', 'deleted') */
  action: string;
}

/**
 * Result of triggering CI
 */
export interface CITriggerResult {
  /** Whether the CI trigger was successful */
  success: boolean;
  /** Error message if trigger failed */
  error?: string;
  /** Whether the trigger was skipped (env var not set) */
  skipped?: boolean;
}

export class PromptCITriggerService {
  /**
   * Check if CI trigger is enabled via environment variable
   */
  private isCITriggerEnabled(): boolean {
    const envValue = process.env.LANGFUSE_SYNC_CI_TRIGGER;
    return envValue === 'true' || envValue === '1';
  }

  /**
   * Trigger repository_dispatch event after successful commit
   *
   * @param workDir - Working directory (worktree or project path)
   * @param promptPayload - Prompt information to include in client_payload
   * @returns CI trigger result with success status
   */
  async triggerCI(workDir: string, promptPayload: PromptPayload): Promise<CITriggerResult> {
    // Check if CI trigger is enabled
    if (!this.isCITriggerEnabled()) {
      logger.debug('CI trigger skipped: LANGFUSE_SYNC_CI_TRIGGER not enabled');
      return {
        success: true,
        skipped: true,
      };
    }

    // Check if gh CLI is available
    const ghAvailable = await isGhCliAvailable();
    if (!ghAvailable) {
      logger.warn('gh CLI not available, cannot trigger CI');
      return {
        success: false,
        error: 'gh CLI not available',
      };
    }

    try {
      // Build client_payload JSON
      const clientPayload = {
        name: promptPayload.name,
        version: promptPayload.version,
        labels: promptPayload.labels || [],
        action: promptPayload.action,
      };

      logger.info(
        `Triggering CI for prompt update: ${promptPayload.name} v${promptPayload.version} (${promptPayload.action})`
      );

      // Use gh CLI with --input stdin to avoid shell injection via prompt names
      const requestBody = JSON.stringify({
        event_type: 'langfuse-prompt-update',
        client_payload: clientPayload,
      });

      await execAsync(
        `echo '${requestBody.replace(/'/g, "'\\''")}' | gh api repos/{owner}/{repo}/dispatches --input -`,
        {
          cwd: workDir,
          env: execEnv,
        }
      );

      logger.info(`Successfully triggered CI for prompt: ${promptPayload.name}`);
      return {
        success: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to trigger CI: ${errorMsg}`);

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Trigger CI after successful commit (convenience method)
   * This should be called after a commit is successfully made to GitHub
   *
   * @param workDir - Working directory
   * @param promptPayload - Prompt information
   * @returns CI trigger result
   */
  async triggerCIAfterCommit(
    workDir: string,
    promptPayload: PromptPayload
  ): Promise<CITriggerResult> {
    logger.debug('Checking if CI trigger should fire after successful commit');
    return this.triggerCI(workDir, promptPayload);
  }
}

// Export singleton instance
export const promptCITriggerService = new PromptCITriggerService();
