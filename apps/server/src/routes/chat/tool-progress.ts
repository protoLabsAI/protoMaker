/**
 * ToolProgressEmitter — Rate-limited sideband for streaming tool execution status
 * to the chat UI via the existing WebSocket event bus.
 *
 * Any Ava tool can emit progress labels during execution. The chat UI picks them
 * up via the `chat:tool-progress` event and displays them in the tool card header
 * and AILoader component.
 *
 * Usage in a tool's execute function:
 *   emitter.emitProgress(toolCallId, 'Reading file', 'Read');
 *   // ... do work ...
 *   emitter.clear(toolCallId);
 */

import type { EventEmitter } from '../../lib/events.js';

/** Minimum interval between progress emissions for the same toolCallId. */
const RATE_LIMIT_MS = 150;

export class ToolProgressEmitter {
  private lastEmitTime = new Map<string, number>();

  constructor(private events: EventEmitter) {}

  /**
   * Emit a progress label for a running tool call.
   * Rate-limited per toolCallId to avoid flooding the WebSocket.
   */
  emitProgress(toolCallId: string, label: string, toolName?: string): void {
    const now = Date.now();
    const lastTime = this.lastEmitTime.get(toolCallId) ?? 0;

    if (now - lastTime < RATE_LIMIT_MS) return;

    this.lastEmitTime.set(toolCallId, now);
    this.events.emit('chat:tool-progress', {
      toolCallId,
      label,
      toolName,
      timestamp: new Date().toISOString(),
    });
  }

  /** Cleanup tracking state when a tool completes. */
  clear(toolCallId: string): void {
    this.lastEmitTime.delete(toolCallId);
  }
}
