/**
 * Calendar Types
 *
 * Types for calendar events and storage infrastructure.
 * Supports feature milestones, custom events, and external integrations (Google Calendar).
 */

/**
 * Type of calendar event
 */
export type CalendarEventType = 'feature' | 'milestone' | 'custom' | 'google' | 'job' | 'ceremony';

/**
 * Job execution status
 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Job action types
 *
 * ### `run-command` format
 *
 * The `command` field must be a **single, simple shell command** with no shell
 * metacharacters. The executor enforces the following constraints at runtime:
 *
 * - Maximum length: 1024 characters
 * - Disallowed (unescaped): `;`  `&&`  `||`  `|`  `>`  `<`  `$`  `` ` ``
 *
 * If a special character is required literally, prefix it with a backslash
 * (e.g. `\$`). Shell features such as piping, redirection, variable expansion,
 * and command chaining are **not** supported and will cause the job to fail.
 *
 * **Valid examples:**
 * ```
 * npm run build
 * python3 scripts/migrate.py
 * ./bin/run-task.sh --env production
 * ```
 *
 * **Invalid examples (will be rejected):**
 * ```
 * npm run build && npm test   // && not allowed
 * echo $HOME                  // $ not allowed
 * cat file.txt | grep error   // | not allowed
 * ```
 */
export type JobAction =
  | { type: 'start-agent'; featureId: string }
  | { type: 'run-automation'; automationId: string }
  | {
      type: 'run-command';
      /**
       * The shell command to execute.
       * Must be a single command with no shell metacharacters.
       * Maximum length: 1024 characters.
       * @see {JobAction} for full format rules and examples.
       */
      command: string;
      /** Optional working directory for the command */
      cwd?: string;
    };

/**
 * Result of a job execution
 */
export interface JobExecutionResult {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
}

/**
 * Recurrence rule for repeating calendar events.
 *
 * Defines how an event repeats over time: frequency, interval,
 * specific days of the week, and termination conditions.
 */
export interface RecurrenceRule {
  /** How often the event repeats */
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';

  /** Number of frequency units between occurrences (default: 1) */
  interval?: number;

  /** Days of the week (0 = Sunday, 6 = Saturday). Only meaningful for weekly frequency. */
  daysOfWeek?: number[];

  /** Date after which recurrence stops (YYYY-MM-DD format, inclusive) */
  endDate?: string;

  /** Maximum number of occurrences */
  count?: number;
}

/**
 * Calendar event
 */
export interface CalendarEvent {
  /** Unique identifier for the event */
  id: string;

  /** Project path this event belongs to */
  projectPath: string;

  /** Event title */
  title: string;

  /** Event date in YYYY-MM-DD format */
  date: string;

  /** Optional end date for multi-day events (YYYY-MM-DD format) */
  endDate?: string;

  /** Event type */
  type: CalendarEventType;

  /** Time in HH:mm 24h format (used by job events) */
  time?: string;

  /** Job action to execute (required when type is 'job') */
  jobAction?: JobAction;

  /** Job execution status (set automatically for job events) */
  jobStatus?: JobStatus;

  /** Job execution result (populated after execution) */
  jobResult?: JobExecutionResult;

  /** Source ID from external system (e.g., Google Calendar event ID) */
  sourceId?: string;

  /** Event description/notes */
  description?: string;

  /** Display color (hex color code) */
  color?: string;

  /** URL to external resource */
  url?: string;

  /** Whether this is an all-day event */
  allDay?: boolean;

  /** Recurrence rule for repeating events */
  recurrence?: RecurrenceRule;

  /** IANA timezone identifier (e.g., "America/New_York"). Used for time-aware scheduling. */
  timezone?: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Calendar events file structure
 */
export interface CalendarEventsFile {
  /** File format version */
  version: 1;

  /** Array of calendar events */
  events: CalendarEvent[];
}

/**
 * Options for querying calendar events
 */
export interface CalendarQueryOptions {
  /** Start date for range query (YYYY-MM-DD format) */
  startDate?: string;

  /** End date for range query (YYYY-MM-DD format) */
  endDate?: string;

  /** Filter by event types */
  types?: CalendarEventType[];
}
