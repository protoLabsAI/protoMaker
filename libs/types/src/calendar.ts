/**
 * Calendar Types
 *
 * Types for calendar events and storage infrastructure.
 * Supports feature milestones, custom events, and external integrations (Google Calendar, Linear).
 */

/**
 * Type of calendar event
 */
export type CalendarEventType = 'feature' | 'milestone' | 'custom' | 'google' | 'linear' | 'job';

/**
 * Job execution status
 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Job action types
 */
export type JobAction =
  | { type: 'start-agent'; featureId: string }
  | { type: 'run-automation'; automationId: string }
  | { type: 'run-command'; command: string; cwd?: string };

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

  /** Source ID from external system (e.g., Linear issue ID, Google Calendar event ID) */
  sourceId?: string;

  /** Event description/notes */
  description?: string;

  /** Display color (hex color code) */
  color?: string;

  /** URL to external resource */
  url?: string;

  /** Whether this is an all-day event */
  allDay?: boolean;

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
