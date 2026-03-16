/**
 * Calendar Types
 *
 * Types for calendar events and storage infrastructure.
 * Supports feature milestones, custom events, and external integrations (Google Calendar).
 */

/**
 * Type of calendar event
 */
export type CalendarEventType =
  | 'feature'
  | 'milestone'
  | 'custom'
  | 'google'
  | 'job'
  | 'ceremony'
  | 'ops';

/**
 * Recurrence frequency unit
 */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Recurrence rule for repeating events
 */
export interface RecurrenceRule {
  /** How often the event repeats */
  frequency: RecurrenceFrequency;
  /** Repeat every N units (defaults to 1) */
  interval?: number;
  /** Stop recurring after this date (YYYY-MM-DD) */
  endDate?: string;
}

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

  /** IANA timezone name for the event (e.g., 'America/New_York') */
  timezone?: string;

  /**
   * IDs of conflicting job events at the same date+time.
   * Computed by the server on list responses; not persisted.
   */
  conflictsWith?: string[];

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
