/**
 * Timer Registry Types
 *
 * Unified type definitions for all managed timers — both cron-based tasks
 * and interval-based timers — tracked by the SchedulerService.
 */

/**
 * Category for grouping timers by operational purpose.
 */
export type TimerCategory = 'maintenance' | 'health' | 'monitor' | 'sync' | 'system';

/**
 * Discriminated type for a timer entry — either a cron task or an interval timer.
 */
export type TimerType = 'cron' | 'interval';

/**
 * Unified registry entry for a managed timer.
 *
 * Both cron tasks and interval-based timers conform to this shape,
 * enabling `listAll()` to return a single unified list.
 */
export interface TimerRegistryEntry {
  /** Unique timer identifier */
  id: string;
  /** Human-readable timer name */
  name: string;
  /** Timer type — 'cron' uses a cron expression; 'interval' uses a fixed interval */
  type: TimerType;
  /** Interval in milliseconds (only set for type === 'interval') */
  intervalMs?: number;
  /** Cron expression string (only set for type === 'cron') */
  expression?: string;
  /** Whether the timer is currently enabled */
  enabled: boolean;
  /** ISO string of the last time the timer fired */
  lastRun?: string;
  /** ISO string of the next scheduled fire time (cron only; intervals fire continuously) */
  nextRun?: string;
  /** Duration of the last execution in milliseconds */
  duration?: number;
  /** Number of consecutive failures */
  failureCount: number;
  /** Total number of executions */
  executionCount: number;
  /** Operational category for grouping */
  category: TimerCategory;
}

/**
 * Aggregated metrics returned by `SchedulerService.getMetrics()`.
 */
export interface TimerRegistryMetrics {
  /** Total number of registered timers (cron + interval) */
  totalTimers: number;
  /** Number of currently enabled timers */
  enabledTimers: number;
  /** Number of currently paused (disabled) timers */
  pausedTimers: number;
  /** Total execution count across all timers */
  totalExecutions: number;
  /** Total failure count across all timers */
  totalFailures: number;
  /** Per-category breakdown */
  byCategory: Record<TimerCategory, number>;
  /** Per-type breakdown */
  byType: Record<TimerType, number>;
}
