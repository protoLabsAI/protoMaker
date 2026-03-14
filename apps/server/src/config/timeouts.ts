/**
 * Central timeout configuration for the server.
 *
 * All timeout and sleep-interval constants are defined here.
 * Each reads from a named environment variable with the previous
 * hardcoded value as the default, so no behavioural change occurs
 * unless the operator explicitly sets the variable.
 *
 * Grouped by domain:
 *   - execution      : agent run budgets
 *   - polling        : loop sleep intervals and retry delays
 *   - networking     : shell command and HTTP request timeouts
 *   - cleanup        : post-merge / maintenance delays
 *   - crdt           : sync server heartbeat/reconnect timing
 *   - health         : health monitor check intervals
 *   - archival       : feature archival check intervals
 *   - worktree       : worktree lifecycle timing
 *   - pr-feedback    : pull request review polling and CI wait timing
 *   - pr-watcher     : background PR CI monitor timing
 *   - work-intake    : phase claiming timing
 *   - stream-observer: agent stream stall detection
 *   - agents         : authority agent poll intervals
 *   - ava            : Ava channel reactor timing
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

// ── CRDT Sync ─────────────────────────────────────────────────────────────────

/** Interval between heartbeat pings in the CRDT sync server (default: 30 s). */
export const CRDT_HEARTBEAT_MS = parseInt(process.env.CRDT_HEARTBEAT_MS ?? '30000', 10);

/** Time-to-live for a peer without a heartbeat before eviction (default: 120 s). */
export const CRDT_TTL_MS = parseInt(process.env.CRDT_TTL_MS ?? '120000', 10);

/** Delay before attempting to reconnect to the CRDT sync server (default: 5 s). */
export const CRDT_RECONNECT_INTERVAL_MS = parseInt(
  process.env.CRDT_RECONNECT_INTERVAL_MS ?? '5000',
  10
);

/** Interval at which peer TTLs are checked and expired peers evicted (default: 10 s). */
export const CRDT_TTL_CHECK_INTERVAL_MS = parseInt(
  process.env.CRDT_TTL_CHECK_INTERVAL_MS ?? '10000',
  10
);

// ── Health Monitor ────────────────────────────────────────────────────────────

/** How often the health monitor checks for stuck features and resource usage (default: 30 s). */
export const HEALTH_CHECK_INTERVAL_MS = parseInt(
  process.env.HEALTH_CHECK_INTERVAL_MS ?? String(30 * 1000),
  10
);

/** How long a feature can be in_progress without activity before being considered stuck (default: 30 min). */
export const STUCK_FEATURE_THRESHOLD_MS = parseInt(
  process.env.STUCK_FEATURE_THRESHOLD_MS ?? String(30 * 60 * 1000),
  10
);

// ── Archival ──────────────────────────────────────────────────────────────────

/** How often the archival service checks for features eligible for archival (default: 10 min). */
export const ARCHIVAL_CHECK_INTERVAL_MS = parseInt(
  process.env.ARCHIVAL_CHECK_INTERVAL_MS ?? String(10 * 60 * 1000),
  10
);

// ── Worktree Lifecycle ────────────────────────────────────────────────────────

/** Delay after PR merge before worktree cleanup to allow CI/webhooks to settle (default: 10 s). */
export const WORKTREE_CLEANUP_DELAY_MS = parseInt(
  process.env.WORKTREE_CLEANUP_DELAY_MS ?? '10000',
  10
);

/** How often to scan for phantom / orphaned worktrees (default: 6 h). */
export const WORKTREE_DRIFT_CHECK_INTERVAL_MS = parseInt(
  process.env.WORKTREE_DRIFT_CHECK_INTERVAL_MS ?? String(6 * 60 * 60 * 1000),
  10
);

// ── PR Feedback ───────────────────────────────────────────────────────────────

/** How often PR Feedback Service polls GitHub for review status (default: 60 s). */
export const PR_FEEDBACK_POLL_INTERVAL_MS = parseInt(
  process.env.PR_FEEDBACK_POLL_INTERVAL_MS ?? '60000',
  10
);

/** How often to poll for CI check status in PR Feedback Service (default: 60 s). */
export const PR_FEEDBACK_CI_POLL_INTERVAL_MS = parseInt(
  process.env.PR_FEEDBACK_CI_POLL_INTERVAL_MS ?? '60000',
  10
);

/** Maximum time to wait for CI checks to complete in PR Feedback Service (default: 10 min). */
export const PR_FEEDBACK_CI_MAX_WAIT_MS = parseInt(
  process.env.PR_FEEDBACK_CI_MAX_WAIT_MS ?? String(10 * 60 * 1000),
  10
);

/**
 * How long a PR can wait before alerting on required CI checks that never registered (default: 30 min).
 * Configurable via MISSING_CI_CHECK_THRESHOLD_MINUTES env variable.
 */
export const PR_FEEDBACK_MISSING_CI_CHECK_THRESHOLD_MS = (() => {
  const minutes = parseInt(process.env.MISSING_CI_CHECK_THRESHOLD_MINUTES ?? '30', 10);
  return (isNaN(minutes) || minutes <= 0 ? 30 : minutes) * 60 * 1000;
})();

// ── PR Watcher ────────────────────────────────────────────────────────────────

/** How often PR Watcher Service polls CI state for watched PRs (default: 30 s). */
export const PR_WATCHER_POLL_INTERVAL_MS = parseInt(
  process.env.PR_WATCHER_POLL_INTERVAL_MS ?? '30000',
  10
);

/** Maximum time before a PR watch auto-expires (default: 30 min). */
export const PR_WATCHER_TIMEOUT_MS = parseInt(
  process.env.PR_WATCHER_TIMEOUT_MS ?? String(30 * 60 * 1000),
  10
);

// ── Work Intake ───────────────────────────────────────────────────────────────

/** How often Work Intake Service checks for claimable phases (default: 30 s). */
export const WORK_INTAKE_TICK_INTERVAL_MS = parseInt(
  process.env.WORK_INTAKE_TICK_INTERVAL_MS ?? '30000',
  10
);

/** How long before a stale phase claim becomes reclaimable (default: 30 min). */
export const WORK_INTAKE_CLAIM_TIMEOUT_MS = parseInt(
  process.env.WORK_INTAKE_CLAIM_TIMEOUT_MS ?? String(30 * 60 * 1000),
  10
);

// ── Stream Observer ───────────────────────────────────────────────────────────

/** How long with no tool_use events before declaring an agent stall (default: 5 min). */
export const STREAM_OBSERVER_STALL_TIMEOUT_MS = parseInt(
  process.env.STREAM_OBSERVER_STALL_TIMEOUT_MS ?? String(5 * 60 * 1000),
  10
);

// ── Authority Agents ──────────────────────────────────────────────────────────

/** How often EM agent polls for ready features (default: 10 s). */
export const EM_POLL_INTERVAL_MS = parseInt(process.env.EM_POLL_INTERVAL_MS ?? '10000', 10);

/** How often ProjM agent polls for approved features and milestone completion (default: 15 s). */
export const PROJM_POLL_INTERVAL_MS = parseInt(process.env.PROJM_POLL_INTERVAL_MS ?? '15000', 10);

// ── Ava Channel Reactor ───────────────────────────────────────────────────────

/** Base delay for exponential backoff on CRDT subscription errors (default: 5 s). */
export const AVA_REACTOR_RESUBSCRIBE_BASE_MS = parseInt(
  process.env.AVA_REACTOR_RESUBSCRIBE_BASE_MS ?? '5000',
  10
);

/** Maximum delay cap for exponential backoff on subscription errors (default: 60 s). */
export const AVA_REACTOR_RESUBSCRIBE_MAX_MS = parseInt(
  process.env.AVA_REACTOR_RESUBSCRIBE_MAX_MS ?? '60000',
  10
);

/** Interval at which capacity heartbeats are broadcast to the Ava channel (default: 60 s). */
export const AVA_REACTOR_HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.AVA_REACTOR_HEARTBEAT_INTERVAL_MS ?? '60000',
  10
);

/** Interval at which DORA reports are broadcast (default: 1 h). */
export const AVA_REACTOR_DORA_REPORT_INTERVAL_MS = parseInt(
  process.env.AVA_REACTOR_DORA_REPORT_INTERVAL_MS ?? String(60 * 60 * 1000),
  10
);

/** Duration to pause work-stealing from a degraded peer (default: 5 min). */
export const AVA_REACTOR_HEALTH_ALERT_PAUSE_MS = parseInt(
  process.env.AVA_REACTOR_HEALTH_ALERT_PAUSE_MS ?? String(5 * 60 * 1000),
  10
);
