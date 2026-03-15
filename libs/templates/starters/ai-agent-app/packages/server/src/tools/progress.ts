/**
 * ToolProgressEmitter — rate-limited tool progress broadcaster.
 *
 * Wraps `broadcastProgress()` from the WebSocket sideband with a 150 ms
 * throttle so high-frequency updates (e.g. per-chunk LLM calls, tight loops)
 * don't overwhelm WebSocket clients.
 *
 * ## Throttle behaviour
 *
 * - The **first** call after a quiet period is sent immediately.
 * - Subsequent calls within the 150 ms window are coalesced: only the
 *   **latest** pending update is buffered and sent once the window expires.
 * - Calling `flush()` at the end of a tool's `execute` function guarantees the
 *   final progress message is delivered before the tool result is returned.
 *
 * ## Usage
 *
 * Import the module-level singleton `toolProgress` in any tool's `execute`:
 *
 * ```typescript
 * import { toolProgress } from './progress.js';
 *
 * execute: async (input) => {
 *   toolProgress.emit('my_tool', 'Starting…');
 *   // … do work …
 *   toolProgress.emit('my_tool', 'Halfway there…', { percent: 50 });
 *   // … more work …
 *   toolProgress.flush(); // ensure last update reaches clients
 *   return result;
 * }
 * ```
 *
 * Or create a per-tool instance when you need independent rate-limit windows:
 *
 * ```typescript
 * const emitter = new ToolProgressEmitter();
 * emitter.emit('tool_a', 'Step 1');
 * ```
 */

import { broadcastProgress, type ToolProgressEvent } from '../ws.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum interval between emitted WebSocket messages (milliseconds). */
export const PROGRESS_RATE_LIMIT_MS = 150;

// ─── ToolProgressEmitter ──────────────────────────────────────────────────────

export class ToolProgressEmitter {
  private _lastEmitAt = 0;
  private _pending: ToolProgressEvent | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Emit a progress update for the given tool.
   *
   * If called within 150 ms of the previous emission the update is buffered.
   * Only the most recent buffered update is kept — intermediate values are
   * dropped to reduce noise.
   *
   * @param toolName  Name of the tool emitting the update.
   * @param message   Human-readable status string.
   * @param data      Optional structured payload (tool-specific metadata).
   */
  emit(toolName: string, message: string, data?: unknown): void {
    const now = Date.now();
    const event: ToolProgressEvent = {
      type: 'tool:progress',
      toolName,
      message,
      timestamp: now,
      data,
    };

    const elapsed = now - this._lastEmitAt;

    if (elapsed >= PROGRESS_RATE_LIMIT_MS) {
      // Enough time has passed — send immediately.
      this._sendNow(event, now);
    } else {
      // Too soon — buffer this update, replacing any previous pending event.
      this._pending = event;

      if (this._timer === null) {
        // Schedule a deferred send for the remainder of the rate-limit window.
        this._timer = setTimeout(() => {
          const pending = this._pending;
          this._pending = null;
          this._timer = null;

          if (pending) {
            this._sendNow(pending, Date.now());
          }
        }, PROGRESS_RATE_LIMIT_MS - elapsed);
      }
    }
  }

  /**
   * Flush any pending buffered event immediately.
   *
   * Call this at the end of a tool's `execute` function to guarantee the last
   * progress update is delivered before the tool result is returned to the
   * model.
   */
  flush(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    const pending = this._pending;
    this._pending = null;

    if (pending) {
      this._sendNow(pending, Date.now());
    }
  }

  /** Reset internal state (useful for testing). */
  reset(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._pending = null;
    this._lastEmitAt = 0;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _sendNow(event: ToolProgressEvent, now: number): void {
    this._lastEmitAt = now;
    broadcastProgress(event);
  }
}

// ─── Module-level singleton ───────────────────────────────────────────────────

/**
 * Shared `ToolProgressEmitter` instance.
 *
 * Import this directly in tool `execute` functions for the simplest usage.
 * All tools sharing this instance share the same 150 ms rate-limit window —
 * create a `new ToolProgressEmitter()` per tool if you need independent windows.
 */
export const toolProgress = new ToolProgressEmitter();
