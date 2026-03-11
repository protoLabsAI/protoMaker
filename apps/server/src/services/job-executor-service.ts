/**
 * Job Executor Service
 *
 * Executes one-time scheduled jobs from the calendar.
 * Registered as a per-minute task with the SchedulerService.
 * Each tick scans all known projects for due jobs and dispatches them.
 */

import { exec } from 'node:child_process';
import { createLogger } from '@protolabsai/utils';
import type { CalendarEvent } from '@protolabsai/types';
import type { CalendarService } from './calendar-service.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { AutomationService } from './automation-service.js';
import type { SettingsService } from './settings-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('JobExecutorService');

/** Maximum command execution time: 5 minutes */
const COMMAND_TIMEOUT_MS = 300_000;

/** Maximum allowed command length in characters */
const MAX_COMMAND_LENGTH = 1024;

/**
 * Regex that detects unescaped shell metacharacters.
 * Matched characters: ; | > < $ ` and the two-character sequences && and ||
 * A preceding backslash (e.g. \; or \$) exempts the character from rejection.
 */
const SHELL_METACHAR_RE = /(?<!\\)[;|><$`]|(?<!\\)&&/;

/**
 * Validate and sanitize a shell command before execution.
 *
 * Rules enforced:
 * - Must not exceed MAX_COMMAND_LENGTH (1024) characters
 * - Must not contain unescaped shell metacharacters: ; && || | > < $ `
 *
 * Exported as a pure function so it can be unit-tested in isolation.
 *
 * @param command Raw command string supplied by the job action
 * @returns The same command string if it passes all checks
 * @throws Error with a descriptive message when the command is invalid
 *
 * @example
 *   sanitizeCommand('npm run build')          // OK — returns the command
 *   sanitizeCommand('npm run build; rm -rf /') // throws — unescaped ;
 *   sanitizeCommand('echo $HOME')              // throws — unescaped $
 */
export function sanitizeCommand(command: string): string {
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new Error(
      `Command exceeds maximum length of ${MAX_COMMAND_LENGTH} characters (got ${command.length})`
    );
  }

  if (SHELL_METACHAR_RE.test(command)) {
    throw new Error(
      `Command contains unescaped shell metacharacters. ` +
        `Only simple single commands are allowed (e.g. "npm run build"). ` +
        `Disallowed characters: ; && || | > < $ \`. ` +
        `Escape special characters with a backslash if they are required literally.`
    );
  }

  return command;
}

export class JobExecutorService {
  constructor(
    private calendarService: CalendarService,
    private autoModeService: AutoModeService,
    private automationService: AutomationService,
    private settingsService: SettingsService,
    private events: EventEmitter
  ) {}

  /**
   * Scan all known project paths for due jobs and execute them.
   * Called once per minute by the scheduler.
   */
  async tick(): Promise<void> {
    const now = new Date();
    let projectPaths: string[];

    try {
      const settings = await this.settingsService.getGlobalSettings();
      projectPaths = (settings.projects ?? []).map((p) => p.path).filter(Boolean);
    } catch (error) {
      logger.warn('Failed to load project paths for job tick:', error);
      return;
    }

    for (const projectPath of projectPaths) {
      try {
        const dueJobs = await this.calendarService.getDueJobs(projectPath, now);

        for (const job of dueJobs) {
          // Fire and forget — each job runs independently
          this.executeJob(projectPath, job).catch((error) => {
            logger.error(`Unhandled error executing job ${job.id}:`, error);
          });
        }
      } catch (error) {
        logger.warn(`Failed to check due jobs for ${projectPath}:`, error);
      }
    }
  }

  /**
   * Execute a single job event. Updates status to running before dispatch,
   * then to completed/failed after.
   */
  async executeJob(projectPath: string, job: CalendarEvent): Promise<void> {
    if (!job.jobAction) {
      logger.warn(`Job ${job.id} has no jobAction, skipping`);
      return;
    }

    const startedAt = new Date().toISOString();

    // Mark as running
    await this.calendarService.updateEvent(projectPath, job.id, {
      jobStatus: 'running',
    });

    this.calendarService.emitReminder({
      title: job.title,
      description: job.description ?? `Job started: ${job.title}`,
      event: job,
    });

    this.events.emit('job:started', {
      jobId: job.id,
      projectPath,
      action: job.jobAction,
    });

    try {
      await this.dispatchAction(projectPath, job);

      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      await this.calendarService.updateEvent(projectPath, job.id, {
        jobStatus: 'completed',
        jobResult: { startedAt, completedAt, durationMs },
      });

      this.calendarService.emitReminder({
        title: job.title,
        description: `Job completed: ${job.title}`,
        event: job,
      });

      this.events.emit('job:completed', {
        jobId: job.id,
        projectPath,
        action: job.jobAction,
        durationMs,
      });

      logger.info(`Job ${job.id} completed in ${durationMs}ms`);
    } catch (error) {
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.calendarService.updateEvent(projectPath, job.id, {
        jobStatus: 'failed',
        jobResult: { startedAt, completedAt, durationMs, error: errorMessage },
      });

      this.calendarService.emitReminder({
        title: job.title,
        description: `Job failed: ${job.title} — ${errorMessage}`,
        event: job,
      });

      this.events.emit('job:failed', {
        jobId: job.id,
        projectPath,
        action: job.jobAction,
        error: errorMessage,
      });

      logger.error(`Job ${job.id} failed: ${errorMessage}`);
    }
  }

  /**
   * Dispatch the job action to the appropriate service.
   */
  private async dispatchAction(projectPath: string, job: CalendarEvent): Promise<void> {
    const action = job.jobAction!;

    switch (action.type) {
      case 'start-agent':
        await this.autoModeService.executeFeature(projectPath, action.featureId, true);
        break;

      case 'run-automation':
        await this.automationService.executeAutomation(action.automationId, 'scheduler');
        break;

      case 'run-command':
        await this.executeCommand(action.command, action.cwd);
        break;

      default:
        throw new Error(`Unknown job action type: ${(action as { type: string }).type}`);
    }
  }

  /**
   * Execute a shell command with a timeout.
   * The command is validated and sanitized via {@link sanitizeCommand} before
   * being passed to exec — unescaped shell metacharacters and commands exceeding
   * the length limit are rejected with an error.
   */
  private executeCommand(command: string, cwd?: string): Promise<void> {
    const sanitized = sanitizeCommand(command);
    logger.info(`Executing sanitized command: ${sanitized}`);

    return new Promise((resolve, reject) => {
      exec(sanitized, { cwd, timeout: COMMAND_TIMEOUT_MS }, (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message;
          reject(new Error(`Command failed: ${msg}`));
          return;
        }
        logger.info(`Command output: ${stdout?.trim() || '(no output)'}`);
        resolve();
      });
    });
  }
}
