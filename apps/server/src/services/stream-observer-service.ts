/**
 * Stream Observer Service — Loop Detection
 *
 * Wraps the agent stream loop to detect:
 * 1. Tool call loops: same tool+input signature 3+ times in last 8 calls
 * 2. Stalls: no tool_use events in 5 minutes while text is still streaming
 *
 * Returns an abort signal with reason when pathological behavior is detected.
 */

import { createLogger } from '@protolabsai/utils';
import { createHash } from 'node:crypto';
import { STREAM_OBSERVER_STALL_TIMEOUT_MS } from '../config/timeouts.js';

const logger = createLogger('StreamObserver');

const LOOP_WINDOW = 8;
const LOOP_THRESHOLD = 3;
const STALL_TIMEOUT_MS = STREAM_OBSERVER_STALL_TIMEOUT_MS;

/**
 * Tools excluded from loop detection.
 *
 * These are task-management meta-tools that legitimately repeat during normal
 * agent execution (e.g. marking todos complete). Treating them as loops would
 * produce false positives and abort agents that have finished their work.
 */
const LOOP_DETECTION_EXCLUDED_TOOLS = new Set(['TodoWrite', 'TodoRead']);

export interface StreamObserverConfig {
  loopWindow?: number;
  loopThreshold?: number;
  stallTimeoutMs?: number;
}

export interface AbortSignal {
  abort: boolean;
  reason?: string;
}

/**
 * Tracks agent stream activity and detects loops and stalls.
 */
export class StreamObserver {
  private readonly toolSignatures: string[] = [];
  private lastToolUseTime: number;
  private lastTextTime: number;
  private readonly loopWindow: number;
  private readonly loopThreshold: number;
  private readonly stallTimeoutMs: number;

  constructor(config?: StreamObserverConfig) {
    const now = Date.now();
    this.lastToolUseTime = now;
    this.lastTextTime = now;
    this.loopWindow = config?.loopWindow ?? LOOP_WINDOW;
    this.loopThreshold = config?.loopThreshold ?? LOOP_THRESHOLD;
    this.stallTimeoutMs = config?.stallTimeoutMs ?? STALL_TIMEOUT_MS;
  }

  /**
   * Feed a tool_use event to the observer.
   */
  onToolUse(toolName: string, toolInput: unknown): void {
    this.lastToolUseTime = Date.now();

    // Skip task-management meta-tools — they legitimately repeat as the agent
    // marks items complete and are never a real implementation loop.
    if (LOOP_DETECTION_EXCLUDED_TOOLS.has(toolName)) return;

    // Hash the full input string. Truncating to 200 chars caused false positives
    // for tools like TodoWrite where the meaningful change (status update) appears
    // beyond the truncation boundary, making consecutive calls look identical.
    const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput ?? '');
    const hash = createHash('md5').update(inputStr).digest('hex').slice(0, 8);
    const signature = `${toolName}:${hash}`;

    this.toolSignatures.push(signature);

    // Keep only the rolling window
    if (this.toolSignatures.length > this.loopWindow * 2) {
      this.toolSignatures.splice(0, this.toolSignatures.length - this.loopWindow * 2);
    }
  }

  /**
   * Feed a text chunk event to the observer.
   */
  onTextChunk(_text: string): void {
    this.lastTextTime = Date.now();
  }

  /**
   * Check if the agent should be aborted.
   */
  shouldAbort(): AbortSignal {
    // Check for tool call loops
    if (this.toolSignatures.length >= this.loopWindow) {
      const recent = this.toolSignatures.slice(-this.loopWindow);
      const counts = new Map<string, number>();

      for (const sig of recent) {
        counts.set(sig, (counts.get(sig) || 0) + 1);
      }

      for (const [sig, count] of counts) {
        if (count >= this.loopThreshold) {
          const loopSignature = sig;
          logger.warn(
            `Loop detected: ${sig} repeated ${count} times in last ${this.loopWindow} calls`
          );
          return {
            abort: true,
            reason: `Tool call loop detected: "${loopSignature.split(':')[0]}" called ${count} times with same input in last ${this.loopWindow} tool calls`,
          };
        }
      }
    }

    // Check for stalls (no tool use but text still streaming)
    const now = Date.now();
    const timeSinceToolUse = now - this.lastToolUseTime;
    const timeSinceText = now - this.lastTextTime;

    if (timeSinceToolUse > this.stallTimeoutMs && timeSinceText < this.stallTimeoutMs) {
      logger.warn(
        `Stall detected: no tool_use in ${Math.round(timeSinceToolUse / 60000)}min but text still streaming`
      );
      return {
        abort: true,
        reason: `Agent stall detected: no tool calls in ${Math.round(timeSinceToolUse / 60000)} minutes while text is still streaming`,
      };
    }

    return { abort: false };
  }

  /**
   * Get the last detected loop signature for logging.
   */
  getLoopSignature(): string | null {
    if (this.toolSignatures.length < this.loopWindow) return null;

    const recent = this.toolSignatures.slice(-this.loopWindow);
    const counts = new Map<string, number>();

    for (const sig of recent) {
      counts.set(sig, (counts.get(sig) || 0) + 1);
    }

    for (const [sig, count] of counts) {
      if (count >= this.loopThreshold) return sig;
    }

    return null;
  }
}
