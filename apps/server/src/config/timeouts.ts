/**
 * Central timeout configuration for the server.
 *
 * All timeout and sleep-interval constants are defined here.
 * Each reads from a named environment variable with the previous
 * hardcoded value as the default, so no behavioural change occurs
 * unless the operator explicitly sets the variable.
 *
 * Grouped by domain:
 *   - execution  : agent run budgets
 *   - polling    : loop sleep intervals and retry delays
 *   - networking : shell command and HTTP request timeouts
 *   - cleanup    : post-merge / maintenance delays
 */

// ── Execution ────────────────────────────────────────────────────────────────

/** Maximum wall-clock time for a single agent execution run (default: 30 min). */
export const EXECUTE_TIMEOUT_MS = parseInt(
  process.env.EXECUTE_TIMEOUT_MS ?? String(30 * 60 * 1000),
  10
);

// ── Polling ───────────────────────────────────────────────────────────────────

/** Sleep duration when the scheduler is at concurrency capacity (default: 5 s). */
export const SLEEP_INTERVAL_CAPACITY_MS = parseInt(
  process.env.SLEEP_INTERVAL_CAPACITY_MS ?? '5000',
  10
);

/** Sleep duration when the scheduler is idle — no features pending (default: 30 s). */
export const SLEEP_INTERVAL_IDLE_MS = parseInt(process.env.SLEEP_INTERVAL_IDLE_MS ?? '30000', 10);

/** Normal sleep interval between scheduler ticks (default: 2 s). */
export const SLEEP_INTERVAL_NORMAL_MS = parseInt(
  process.env.SLEEP_INTERVAL_NORMAL_MS ?? '2000',
  10
);

/** Sleep interval after a scheduling error (default: 5 s). */
export const SLEEP_INTERVAL_ERROR_MS = parseInt(process.env.SLEEP_INTERVAL_ERROR_MS ?? '5000', 10);

/** Delay between review-state polls for CI / approval status (default: 30 s). */
export const REVIEW_POLL_DELAY_MS = parseInt(
  process.env.REVIEW_POLL_DELAY_MS ?? String(30 * 1000),
  10
);

/**
 * Maximum time a feature can remain in REVIEW before auto-escalating (default: 45 min).
 * Configurable via REVIEW_PENDING_TIMEOUT_MINUTES (takes precedence if set).
 */
export const REVIEW_PENDING_TIMEOUT_MS = (() => {
  const minutes = parseInt(process.env.REVIEW_PENDING_TIMEOUT_MINUTES ?? '45', 10);
  return (isNaN(minutes) || minutes <= 0 ? 45 : minutes) * 60 * 1000;
})();

// ── Networking ────────────────────────────────────────────────────────────────

/** Default timeout for event-hook shell commands (default: 30 s). */
export const EVENT_HOOK_SHELL_TIMEOUT_MS = parseInt(
  process.env.EVENT_HOOK_SHELL_TIMEOUT_MS ?? '30000',
  10
);

/** Default timeout for event-hook HTTP requests (default: 10 s). */
export const EVENT_HOOK_HTTP_TIMEOUT_MS = parseInt(
  process.env.EVENT_HOOK_HTTP_TIMEOUT_MS ?? '10000',
  10
);

// ── Cleanup ───────────────────────────────────────────────────────────────────

/** Delay between merge retry attempts (default: 60 s). */
export const MERGE_RETRY_DELAY_MS = parseInt(
  process.env.MERGE_RETRY_DELAY_MS ?? String(60 * 1000),
  10
);
