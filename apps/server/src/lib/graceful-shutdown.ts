/**
 * Graceful Shutdown Handler
 *
 * Registers SIGTERM/SIGINT handlers that orchestrate an orderly server shutdown:
 *   1. Stop new agent starts (block auto-mode scheduling)
 *   2. Suspend active workflows with checkpoints (mark running features interrupted)
 *   3. Flush Langfuse traces
 *   4. Close SQLite connections (ConversationStore / KnowledgeStore)
 *   5. Exit cleanly (process.exit(0))
 *
 * A configurable 30-second timeout triggers process.exit(1) if shutdown hangs.
 */

import type * as http from 'node:http';
import { createLogger } from '@protolabsai/utils';
import { shutdownLangfuse } from './langfuse-singleton.js';

const logger = createLogger('graceful-shutdown');

/** Milliseconds before the force-kill fires if shutdown has not completed. */
const SHUTDOWN_TIMEOUT_MS = 30_000;

/** Set to true once a shutdown signal has been received to prevent re-entrant calls. */
let shuttingDown = false;

// ---------------------------------------------------------------------------
// Shutdown options
// ---------------------------------------------------------------------------

export interface GracefulShutdownOptions {
  /** HTTP server to close after services are torn down. */
  server: http.Server;

  /**
   * Async callback that stops new agent starts and suspends active workflows.
   * Typically calls `autoModeService.shutdown()`.
   */
  shutdownAgents: () => Promise<void>;

  /**
   * Optional: close any open SQLite connections (e.g. ConversationStore, KnowledgeStore).
   * Called after agents are suspended to ensure in-flight writes complete first.
   */
  closeSqlite?: () => void;

  /**
   * Signal that triggered this shutdown ('SIGTERM' | 'SIGINT' | 'manual').
   * Used for logging only.
   */
  signal?: string;

  /** Override the default 30s timeout (ms). */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Core shutdown sequence
// ---------------------------------------------------------------------------

/**
 * Execute the full graceful-shutdown sequence.
 * Returns a promise that resolves once `process.exit(0)` is called.
 */
export async function runGracefulShutdown(opts: GracefulShutdownOptions): Promise<void> {
  if (shuttingDown) {
    logger.warn('[graceful-shutdown] Already shutting down — ignoring duplicate signal');
    return;
  }
  shuttingDown = true;

  const signal = opts.signal ?? 'manual';
  const timeoutMs = opts.timeoutMs ?? SHUTDOWN_TIMEOUT_MS;

  logger.info(
    `[graceful-shutdown] Received ${signal} — beginning orderly shutdown (timeout: ${timeoutMs / 1000}s)`
  );

  // ── Force-kill watchdog ──────────────────────────────────────────────────
  const forceKill = setTimeout(() => {
    logger.error(
      `[graceful-shutdown] Shutdown did not complete within ${timeoutMs / 1000}s — force-killing process`
    );
    process.exit(1);
  }, timeoutMs);
  // Unref so the timer does not keep the event loop alive on its own
  forceKill.unref();

  try {
    // ── Step 1: Stop new agent starts / suspend active workflows ────────────
    logger.info('[graceful-shutdown] Step 1/4 — suspending active agents and workflows...');
    try {
      await opts.shutdownAgents();
      logger.info('[graceful-shutdown] Step 1/4 complete — agents suspended');
    } catch (err) {
      logger.warn('[graceful-shutdown] Step 1/4 failed (non-fatal):', err);
    }

    // ── Step 2: Flush Langfuse traces ────────────────────────────────────────
    logger.info('[graceful-shutdown] Step 2/4 — flushing Langfuse traces...');
    try {
      await shutdownLangfuse();
      logger.info('[graceful-shutdown] Step 2/4 complete — Langfuse traces flushed');
    } catch (err) {
      logger.warn('[graceful-shutdown] Step 2/4 failed (non-fatal):', err);
    }

    // ── Step 3: Close SQLite connections ─────────────────────────────────────
    logger.info('[graceful-shutdown] Step 3/4 — closing SQLite connections...');
    try {
      if (opts.closeSqlite) {
        opts.closeSqlite();
        logger.info('[graceful-shutdown] Step 3/4 complete — SQLite connections closed');
      } else {
        logger.info('[graceful-shutdown] Step 3/4 skipped — no SQLite connections registered');
      }
    } catch (err) {
      logger.warn('[graceful-shutdown] Step 3/4 failed (non-fatal):', err);
    }

    // ── Step 4: Close HTTP server ─────────────────────────────────────────────
    logger.info('[graceful-shutdown] Step 4/4 — closing HTTP server...');
    await new Promise<void>((resolve) => {
      opts.server.close(() => {
        logger.info('[graceful-shutdown] Step 4/4 complete — HTTP server closed');
        resolve();
      });
    });
  } finally {
    clearTimeout(forceKill);
  }

  logger.info('[graceful-shutdown] Shutdown complete — exiting cleanly');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Signal registration helper
// ---------------------------------------------------------------------------

/**
 * Register SIGTERM and SIGINT process signal handlers.
 *
 * Both signals invoke `runGracefulShutdown`. Re-entrant signals after the
 * first are silently ignored.
 */
export function registerShutdownSignals(opts: GracefulShutdownOptions): void {
  process.on('SIGTERM', () => {
    runGracefulShutdown({ ...opts, signal: 'SIGTERM' }).catch((err) => {
      logger.error('[graceful-shutdown] Shutdown sequence threw an unhandled error:', err);
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    runGracefulShutdown({ ...opts, signal: 'SIGINT' }).catch((err) => {
      logger.error('[graceful-shutdown] Shutdown sequence threw an unhandled error:', err);
      process.exit(1);
    });
  });

  logger.info('[graceful-shutdown] SIGTERM and SIGINT handlers registered (30s timeout)');
}
