/**
 * Scheduler Service - Executes scheduled tasks based on cron expressions
 *
 * Provides a cron-based task scheduling system that:
 * - Parses and validates cron expressions
 * - Executes tasks on schedule
 * - Tracks last/next run times
 * - Integrates with health monitoring and auto-mode
 *
 * Cron expression format: "minute hour dayOfMonth month dayOfWeek"
 * - minute: 0-59
 * - hour: 0-23
 * - dayOfMonth: 1-31
 * - month: 1-12 (or names: jan, feb, etc.)
 * - dayOfWeek: 0-7 (0 and 7 are Sunday, or names: sun, mon, etc.)
 *
 * Special characters:
 * - *: any value
 * - ,: list separator (1,3,5)
 * - -: range (1-5)
 * - /: step values (*\/15 = every 15)
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('Scheduler');

/**
 * Parsed cron field with allowed values
 */
interface CronField {
  values: number[];
}

/**
 * Parsed cron expression
 */
interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

/**
 * Scheduled task definition
 */
export interface ScheduledTask {
  /** Unique task identifier */
  id: string;
  /** Human-readable task name */
  name: string;
  /** Cron expression defining the schedule */
  cronExpression: string;
  /** Task handler function */
  handler: () => Promise<void> | void;
  /** Whether the task is currently enabled */
  enabled: boolean;
  /** Last time the task was executed (ISO string) */
  lastRun?: string;
  /** Next scheduled execution time (ISO string) */
  nextRun?: string;
  /** Last error message if task failed */
  lastError?: string;
  /** Number of consecutive failures */
  failureCount: number;
  /** Total number of executions */
  executionCount: number;
}

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  executedAt: string;
  duration: number;
  error?: string;
}

/**
 * Scheduler status for health monitoring
 */
export interface SchedulerStatus {
  running: boolean;
  taskCount: number;
  enabledTaskCount: number;
  tasks: Array<{
    id: string;
    name: string;
    enabled: boolean;
    lastRun?: string;
    nextRun?: string;
    failureCount: number;
    executionCount: number;
  }>;
}

/**
 * Day of week name mappings
 */
const DAY_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Month name mappings
 */
const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * Parse a single cron field into allowed values
 */
function parseCronField(field: string, min: number, max: number, names?: Record<string, number>): CronField {
  const values: Set<number> = new Set();

  // Handle names (e.g., "mon" -> 1)
  let normalizedField = field.toLowerCase();
  if (names) {
    for (const [name, value] of Object.entries(names)) {
      normalizedField = normalizedField.replace(new RegExp(`\\b${name}\\b`, 'gi'), String(value));
    }
  }

  // Split by comma for lists
  const parts = normalizedField.split(',');

  for (const part of parts) {
    // Handle step values (*/15 or 1-30/5)
    const [range, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    if (isNaN(step) || step < 1) {
      throw new Error(`Invalid step value: ${stepStr}`);
    }

    if (range === '*') {
      // All values with step
      for (let i = min; i <= max; i += step) {
        values.add(i);
      }
    } else if (range.includes('-')) {
      // Range (e.g., 1-5)
      const [startStr, endStr] = range.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
        throw new Error(`Invalid range: ${range}`);
      }

      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else {
      // Single value
      const value = parseInt(range, 10);
      if (isNaN(value) || value < min || value > max) {
        throw new Error(`Invalid value: ${range} (must be between ${min} and ${max})`);
      }
      values.add(value);
    }
  }

  return { values: Array.from(values).sort((a, b) => a - b) };
}

/**
 * Parse a cron expression into its component fields
 */
export function parseCronExpression(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return {
    minute: parseCronField(minute, 0, 59),
    hour: parseCronField(hour, 0, 23),
    dayOfMonth: parseCronField(dayOfMonth, 1, 31),
    month: parseCronField(month, 1, 12, MONTH_NAMES),
    dayOfWeek: parseCronField(dayOfWeek, 0, 7, DAY_NAMES),
  };
}

/**
 * Validate a cron expression
 */
export function validateCronExpression(expression: string): { valid: boolean; error?: string } {
  try {
    parseCronExpression(expression);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

/**
 * Check if a date matches a parsed cron expression
 */
function matchesCron(date: Date, cron: ParsedCron): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // JavaScript months are 0-indexed
  let dayOfWeek = date.getDay();

  // Normalize day of week (7 -> 0 for Sunday)
  if (dayOfWeek === 7) dayOfWeek = 0;

  // Check if cron dayOfWeek includes 7 (alternative Sunday)
  const normalizedDayOfWeek = cron.dayOfWeek.values.map((d) => (d === 7 ? 0 : d));

  return (
    cron.minute.values.includes(minute) &&
    cron.hour.values.includes(hour) &&
    cron.dayOfMonth.values.includes(dayOfMonth) &&
    cron.month.values.includes(month) &&
    normalizedDayOfWeek.includes(dayOfWeek)
  );
}

/**
 * Calculate the next run time for a cron expression
 */
export function getNextRunTime(cronExpression: string, after: Date = new Date()): Date {
  const cron = parseCronExpression(cronExpression);

  // Start from the next minute
  const next = new Date(after);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);

  // Search for the next matching time (max 2 years ahead to prevent infinite loop)
  const maxIterations = 2 * 365 * 24 * 60; // 2 years in minutes
  let iterations = 0;

  while (iterations < maxIterations) {
    if (matchesCron(next, cron)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
    iterations++;
  }

  throw new Error('Could not find next run time within 2 years');
}

/**
 * Scheduler Service
 *
 * Manages scheduled tasks with cron-based timing, tracking execution history,
 * and integrating with the event system for monitoring.
 */
export class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();
  private parsedCrons: Map<string, ParsedCron> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;
  private events: EventEmitter | null = null;

  /** Check interval in milliseconds (default: 60 seconds) */
  private checkInterval = 60000;

  /**
   * Initialize the scheduler with an event emitter
   */
  initialize(events: EventEmitter): void {
    this.events = events;
    logger.info('Scheduler service initialized');
  }

  /**
   * Register a new scheduled task
   */
  registerTask(
    id: string,
    name: string,
    cronExpression: string,
    handler: () => Promise<void> | void,
    enabled = true
  ): void {
    // Validate cron expression
    const validation = validateCronExpression(cronExpression);
    if (!validation.valid) {
      throw new Error(`Invalid cron expression for task "${name}": ${validation.error}`);
    }

    // Parse and store cron
    const parsed = parseCronExpression(cronExpression);
    this.parsedCrons.set(id, parsed);

    // Calculate next run time
    const nextRun = enabled ? getNextRunTime(cronExpression).toISOString() : undefined;

    // Create task
    const task: ScheduledTask = {
      id,
      name,
      cronExpression,
      handler,
      enabled,
      nextRun,
      failureCount: 0,
      executionCount: 0,
    };

    this.tasks.set(id, task);
    logger.info(`Registered task "${name}" (${id}) with schedule: ${cronExpression}`);

    // Emit event
    this.emitEvent('scheduler:task_registered', { taskId: id, name, cronExpression, enabled });
  }

  /**
   * Unregister a task
   */
  unregisterTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) {
      return false;
    }

    this.tasks.delete(id);
    this.parsedCrons.delete(id);
    logger.info(`Unregistered task "${task.name}" (${id})`);

    this.emitEvent('scheduler:task_unregistered', { taskId: id, name: task.name });
    return true;
  }

  /**
   * Enable a task
   */
  enableTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) {
      return false;
    }

    task.enabled = true;
    task.nextRun = getNextRunTime(task.cronExpression).toISOString();
    logger.info(`Enabled task "${task.name}" (${id})`);

    this.emitEvent('scheduler:task_enabled', { taskId: id, name: task.name, nextRun: task.nextRun });
    return true;
  }

  /**
   * Disable a task
   */
  disableTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) {
      return false;
    }

    task.enabled = false;
    task.nextRun = undefined;
    logger.info(`Disabled task "${task.name}" (${id})`);

    this.emitEvent('scheduler:task_disabled', { taskId: id, name: task.name });
    return true;
  }

  /**
   * Get a task by ID
   */
  getTask(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get scheduler status for health monitoring
   */
  getStatus(): SchedulerStatus {
    const tasks = Array.from(this.tasks.values());
    return {
      running: this.running,
      taskCount: tasks.length,
      enabledTaskCount: tasks.filter((t) => t.enabled).length,
      tasks: tasks.map((t) => ({
        id: t.id,
        name: t.name,
        enabled: t.enabled,
        lastRun: t.lastRun,
        nextRun: t.nextRun,
        failureCount: t.failureCount,
        executionCount: t.executionCount,
      })),
    };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) {
      logger.warn('Scheduler is already running');
      return;
    }

    this.running = true;

    // Run immediately for any tasks that should have run
    void this.tick();

    // Set up interval for checking tasks
    this.intervalId = setInterval(() => {
      void this.tick();
    }, this.checkInterval);

    logger.info(`Scheduler started (check interval: ${this.checkInterval}ms)`);
    this.emitEvent('scheduler:started', { taskCount: this.tasks.size });
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) {
      logger.warn('Scheduler is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.running = false;
    logger.info('Scheduler stopped');
    this.emitEvent('scheduler:stopped', {});
  }

  /**
   * Check and execute due tasks
   */
  private async tick(): Promise<void> {
    const now = new Date();

    for (const [id, task] of this.tasks) {
      if (!task.enabled) continue;

      const cron = this.parsedCrons.get(id);
      if (!cron) continue;

      // Check if current minute matches the cron expression
      if (matchesCron(now, cron)) {
        // Prevent double execution in the same minute
        if (task.lastRun) {
          const lastRunDate = new Date(task.lastRun);
          if (
            lastRunDate.getFullYear() === now.getFullYear() &&
            lastRunDate.getMonth() === now.getMonth() &&
            lastRunDate.getDate() === now.getDate() &&
            lastRunDate.getHours() === now.getHours() &&
            lastRunDate.getMinutes() === now.getMinutes()
          ) {
            continue;
          }
        }

        await this.executeTask(id);
      }
    }
  }

  /**
   * Execute a task immediately
   */
  async executeTask(id: string): Promise<TaskExecutionResult> {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const startTime = Date.now();
    const executedAt = new Date().toISOString();

    logger.info(`Executing task "${task.name}" (${id})`);
    this.emitEvent('scheduler:task_started', { taskId: id, name: task.name, executedAt });

    let success = false;
    let error: string | undefined;

    try {
      await task.handler();
      success = true;
      task.failureCount = 0;
      task.lastError = undefined;
      logger.info(`Task "${task.name}" completed successfully`);
    } catch (err) {
      success = false;
      error = (err as Error).message;
      task.failureCount++;
      task.lastError = error;
      logger.error(`Task "${task.name}" failed:`, err);
    }

    const duration = Date.now() - startTime;
    task.lastRun = executedAt;
    task.executionCount++;
    task.nextRun = task.enabled ? getNextRunTime(task.cronExpression).toISOString() : undefined;

    const result: TaskExecutionResult = {
      taskId: id,
      success,
      executedAt,
      duration,
      error,
    };

    this.emitEvent('scheduler:task_completed', {
      ...result,
      name: task.name,
      nextRun: task.nextRun,
    });

    return result;
  }

  /**
   * Manually trigger a task (for testing or immediate execution)
   */
  async triggerTask(id: string): Promise<TaskExecutionResult> {
    return this.executeTask(id);
  }

  /**
   * Set the check interval (for testing purposes)
   */
  setCheckInterval(ms: number): void {
    this.checkInterval = ms;

    // Restart if running to apply new interval
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  /**
   * Emit an event if emitter is available
   */
  private emitEvent(type: string, payload: unknown): void {
    if (this.events) {
      // Cast type to EventType since scheduler events are valid event types
      this.events.emit(type as Parameters<typeof this.events.emit>[0], payload);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    this.tasks.clear();
    this.parsedCrons.clear();
    this.events = null;
    logger.info('Scheduler service destroyed');
  }
}

// Singleton instance
let schedulerServiceInstance: SchedulerService | null = null;

/**
 * Get the singleton scheduler service instance
 */
export function getSchedulerService(): SchedulerService {
  if (!schedulerServiceInstance) {
    schedulerServiceInstance = new SchedulerService();
  }
  return schedulerServiceInstance;
}
