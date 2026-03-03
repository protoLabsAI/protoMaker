/**
 * Job Executor Service
 *
 * Executes one-time scheduled jobs from the calendar.
 * Registered as a per-minute task with the SchedulerService.
 * Each tick scans all known projects for due jobs and dispatches them.
 */

import { exec } from 'node:child_process';
import { createLogger } from '@protolabs-ai/utils';
import type { CalendarEvent } from '@protolabs-ai/types';
import type { CalendarService } from './calendar-service.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { AutomationService } from './automation-service.js';
import type { SettingsService } from './settings-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('JobExecutorService');

/** Maximum command execution time: 5 minutes */
const COMMAND_TIMEOUT_MS = 300_000;

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
   */
  private executeCommand(command: string, cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(command, { cwd, timeout: COMMAND_TIMEOUT_MS }, (error, stdout, stderr) => {
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
