/**
 * AutoLoopCoordinator
 *
 * Manages the lifecycle of per-worktree auto-loops extracted from
 * AutoModeService.  Each loop is keyed by `'projectPath::branchName'`
 * (or `'projectPath::__main__'` for the main worktree), which enables
 * fully independent loops for different branches of the same project.
 *
 * Responsibilities
 * ─────────────────
 * • Own and expose the Map<key, LoopState> for all active loops
 * • Generate canonical loop keys via makeKey()
 * • Start / stop individual loops
 * • pauseLoop / resumeLoop (external circuit-breaker control)
 * • Rolling 60-second failure-window tracking with a 3-failure threshold
 */

import { createLogger } from '@protolabsai/utils';
import type { AutoLoopState } from '@protolabsai/types';

const logger = createLogger('AutoLoopCoordinator');

// ─── Constants ─────────────────────────────────────────────────────────────

/** Size of the rolling failure window in milliseconds */
const FAILURE_WINDOW_MS = 60_000;

/** Number of failures within the window that triggers a loop pause */
const FAILURE_THRESHOLD = 3;

// ─── Public config type ─────────────────────────────────────────────────────

/**
 * Configuration for a single auto-loop instance.
 * Mirrors the internal AutoModeConfig shape used by AutoModeService.
 */
export interface AutoModeLoopConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
  /** null = main worktree */
  branchName: string | null;
}

// ─── Internal loop state ────────────────────────────────────────────────────

/**
 * Full mutable state for a single running (or paused) loop.
 *
 * This interface is intentionally exported so that AutoModeService can
 * access state fields directly via coordinator.getState(key) without
 * needing per-field accessor methods.
 */
export interface LoopState {
  /** Composite key that uniquely identifies this loop */
  key: string;

  /** Loop configuration (immutable after creation) */
  config: AutoModeLoopConfig;

  /** Convenience alias for config.branchName */
  branchName: string | null;

  /** AbortController used to signal the loop to stop */
  abortController: AbortController;

  /** True while the loop async function is executing */
  isRunning: boolean;

  /**
   * True when the loop has been stopped by the circuit-breaker or an
   * explicit pauseLoop() call.  A paused loop can be restarted via
   * resumeLoop().
   */
  isPaused: boolean;

  /**
   * Unix timestamps (ms) of recent failures within the rolling window.
   * The coordinator trims entries older than FAILURE_WINDOW_MS on each
   * trackFailure() call.
   */
  failureTimestamps: number[];

  /** Optional timer handle for auto-resume after circuit-breaker cooldown */
  cooldownTimer: NodeJS.Timeout | null;

  /** Feature IDs currently being started (prevents race-condition double-starts) */
  startingFeatures: Set<string>;

  /** Count of features blocked by human-assigned dependencies */
  humanBlockedCount: number;

  /** Suppresses repeated idle events until work resumes */
  hasEmittedIdleEvent: boolean;
}

// ─── Coordinator ────────────────────────────────────────────────────────────

export class AutoLoopCoordinator {
  /**
   * The canonical Map of all active loops, keyed by `makeKey()` output.
   *
   * Exposed as a public readonly reference so callers that need to iterate
   * or inspect state directly (e.g. shutdown, getActiveAutoLoopWorktrees)
   * can do so without an additional abstraction layer.
   */
  readonly loops = new Map<string, LoopState>();

  // ── Key generation ────────────────────────────────────────────────────────

  /**
   * Generate the canonical loop key for a project + branch combination.
   *
   * The key format is `'projectPath::branchName'` or
   * `'projectPath::__main__'` when branchName is null (or 'main').
   */
  makeKey(projectPath: string, branchName: string | null): string {
    const normalizedBranch = branchName === 'main' ? null : branchName;
    return `${projectPath}::${normalizedBranch ?? '__main__'}`;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Create state for a new loop and immediately fire `runFn` in the
   * background.
   *
   * The created LoopState is stored in `loops` before `runFn` is called
   * so that concurrent start requests see `isRunning = true` and fail.
   *
   * @throws if a loop with `key` is already running
   */
  startLoop(
    key: string,
    config: AutoModeLoopConfig,
    runFn: (state: LoopState) => Promise<void>
  ): LoopState {
    const existing = this.loops.get(key);
    if (existing?.isRunning) {
      const desc = config.branchName ? `worktree ${config.branchName}` : 'main worktree';
      throw new Error(`Auto mode is already running for ${desc} in project: ${config.projectPath}`);
    }

    const state: LoopState = {
      key,
      config,
      branchName: config.branchName,
      abortController: new AbortController(),
      isRunning: true,
      isPaused: false,
      failureTimestamps: [],
      cooldownTimer: null,
      startingFeatures: new Set(),
      humanBlockedCount: 0,
      hasEmittedIdleEvent: false,
    };

    // CRITICAL: set before any async work so concurrent callers see isRunning=true
    this.loops.set(key, state);

    runFn(state).catch((err: unknown) => {
      logger.error(`[AutoLoopCoordinator] Unhandled loop error for ${key}:`, err);
    });

    return state;
  }

  /**
   * Stop the loop for `key`.
   *
   * Signals the loop to exit via the AbortController and removes the
   * state from `loops`.  Returns the stopped LoopState so the caller
   * can inspect it (e.g. to emit events or log counts).
   * Returns null if no loop is found for `key`.
   */
  stopLoop(key: string): LoopState | null {
    const state = this.loops.get(key);
    if (!state) return null;

    state.isRunning = false;
    state.abortController.abort();

    if (state.cooldownTimer !== null) {
      clearTimeout(state.cooldownTimer);
      state.cooldownTimer = null;
    }

    this.loops.delete(key);
    return state;
  }

  /**
   * Pause the loop for `key` (circuit-breaker activation).
   *
   * Sets `isPaused = true`, marks the loop as not running, and signals
   * the AbortController.  The state is kept in `loops` so that the
   * caller can inspect it after stopping (e.g. to schedule a cooldown
   * timer that will call resumeLoop).
   *
   * Returns true if the loop was found and paused, false otherwise.
   */
  pauseLoop(key: string): boolean {
    const state = this.loops.get(key);
    if (!state) return false;
    if (state.isPaused) return true; // already paused

    state.isPaused = true;
    state.isRunning = false;
    state.abortController.abort();

    logger.info(`[AutoLoopCoordinator] Loop paused: ${key}`);
    return true;
  }

  /**
   * Resume a paused loop by creating a fresh LoopState (new AbortController)
   * and firing `runFn` in the background.
   *
   * Failure history and starting-features are NOT carried over so the
   * resumed loop starts with a clean slate.
   *
   * Returns the new LoopState, or null if no previous state existed.
   */
  resumeLoop(
    key: string,
    config: AutoModeLoopConfig,
    runFn: (state: LoopState) => Promise<void>
  ): LoopState | null {
    // Remove stale paused state if present
    const previous = this.loops.get(key);
    if (previous?.cooldownTimer !== null && previous?.cooldownTimer !== undefined) {
      clearTimeout(previous.cooldownTimer);
    }

    const state: LoopState = {
      key,
      config,
      branchName: config.branchName,
      abortController: new AbortController(),
      isRunning: true,
      isPaused: false,
      failureTimestamps: [],
      cooldownTimer: null,
      startingFeatures: new Set(),
      humanBlockedCount: 0,
      hasEmittedIdleEvent: false,
    };

    this.loops.set(key, state);

    runFn(state).catch((err: unknown) => {
      logger.error(`[AutoLoopCoordinator] Unhandled resumed-loop error for ${key}:`, err);
    });

    logger.info(`[AutoLoopCoordinator] Loop resumed: ${key}`);
    return state;
  }

  // ── Failure tracking ──────────────────────────────────────────────────────

  /**
   * Record a failure for the loop identified by `key` using a rolling
   * 60-second window.
   *
   * Returns `true` when the failure count within the window reaches the
   * threshold (3), indicating the loop should be paused.
   */
  trackFailure(key: string, _errorMsg: string): boolean {
    const state = this.loops.get(key);
    if (!state) return false;

    const now = Date.now();
    state.failureTimestamps.push(now);

    // Prune timestamps outside the rolling window
    state.failureTimestamps = state.failureTimestamps.filter((ts) => now - ts < FAILURE_WINDOW_MS);

    if (state.failureTimestamps.length >= FAILURE_THRESHOLD) {
      logger.warn(
        `[AutoLoopCoordinator] Failure threshold reached for ${key}: ` +
          `${state.failureTimestamps.length} failures in the last ${FAILURE_WINDOW_MS / 1000}s`
      );
      return true;
    }

    return false;
  }

  /**
   * Clear failure history for `key` (e.g. after a successful run or
   * manual reset).
   */
  resetFailures(key: string): void {
    const state = this.loops.get(key);
    if (state) {
      state.failureTimestamps = [];
      state.isPaused = false;
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** True if a loop for `key` is currently executing */
  isRunning(key: string): boolean {
    return this.loops.get(key)?.isRunning ?? false;
  }

  /** Returns the full mutable state for `key`, or undefined */
  getState(key: string): LoopState | undefined {
    return this.loops.get(key);
  }

  /**
   * Returns a public snapshot of the loop state for `key`.
   * Suitable for API responses and external consumers.
   */
  getPublicState(key: string): AutoLoopState | null {
    const state = this.loops.get(key);
    if (!state) return null;
    return {
      key,
      projectPath: state.config.projectPath,
      branchName: state.config.branchName,
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      maxConcurrency: state.config.maxConcurrency,
      failureCount: state.failureTimestamps.length,
    };
  }

  // ── Capacity adjustment ─────────────────────────────────────────────────

  /**
   * Adjust the maxConcurrency limit for a running loop.
   * Used by PortfolioScheduler to dynamically reallocate capacity.
   *
   * - Allows current in-flight agents to finish (no kill)
   * - New dispatches will respect the updated limit
   * - Returns true if the adjustment was applied, false if no loop found
   */
  updateMaxConcurrency(key: string, newMax: number, rationale?: string): boolean {
    const state = this.loops.get(key);
    if (!state) return false;

    const oldMax = state.config.maxConcurrency;
    if (oldMax === newMax) return true; // No change needed

    state.config.maxConcurrency = newMax;

    logger.info(
      `[AutoLoopCoordinator] maxConcurrency adjusted for ${key}: ${oldMax} → ${newMax}` +
        (rationale ? ` (${rationale})` : '')
    );

    return true;
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────

  /**
   * Stop all active loops immediately (e.g. during server shutdown).
   * Clears the internal map after aborting every loop.
   */
  shutdown(): void {
    logger.info(`[AutoLoopCoordinator] Shutting down ${this.loops.size} loop(s)`);
    for (const [key, state] of this.loops) {
      state.isRunning = false;
      state.abortController.abort();
      if (state.cooldownTimer !== null) {
        clearTimeout(state.cooldownTimer);
        state.cooldownTimer = null;
      }
      state.startingFeatures.clear();
      logger.info(`[AutoLoopCoordinator] Stopped loop: ${key}`);
    }
    this.loops.clear();
  }
}
