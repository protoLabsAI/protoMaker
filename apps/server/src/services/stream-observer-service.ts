/**
 * Stream Observer Service — Loop Detection and Context Usage Tracking
 *
 * Wraps the agent stream loop to detect:
 * 1. Tool call loops: same tool+input signature 3+ times in last 8 calls
 * 2. Stalls: no tool_use events in 5 minutes while text is still streaming
 * 3. Context window saturation: cumulative input tokens approaching the model limit
 *
 * Returns an abort signal with reason when pathological behavior is detected.
 * Returns a context warning advisory when the context window usage exceeds a threshold.
 */

import { createLogger } from '@protolabsai/utils';
import type { ContextMetrics } from '@protolabsai/types';
import { createHash } from 'node:crypto';
import { STREAM_OBSERVER_STALL_TIMEOUT_MS } from '../config/timeouts.js';

const logger = createLogger('StreamObserver');

const LOOP_WINDOW = 8;
const LOOP_THRESHOLD = 3;
const STALL_TIMEOUT_MS = STREAM_OBSERVER_STALL_TIMEOUT_MS;

/** Default maximum context window size for Claude models (tokens). */
const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;

/** Default threshold fraction of context window before emitting a wrap-up advisory. */
const DEFAULT_CONTEXT_WARNING_THRESHOLD = 0.7;

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
  /**
   * Fraction of the context window (0.0–1.0) at which to emit a wrap-up advisory.
   * Defaults to DEFAULT_CONTEXT_WARNING_THRESHOLD (0.7).
   */
  contextWarningThreshold?: number;
  /**
   * Maximum context window size in tokens for the running model.
   * Defaults to DEFAULT_MAX_CONTEXT_TOKENS (200_000).
   */
  maxContextTokens?: number;
}

export interface AbortSignal {
  abort: boolean;
  reason?: string;
}

export interface ContextWarningSignal {
  warn: boolean;
  message?: string;
}

/**
 * Tracks agent stream activity and detects loops, stalls, and context window saturation.
 */
export class StreamObserver {
  private readonly toolSignatures: string[] = [];
  private lastToolUseTime: number;
  private lastTextTime: number;
  private readonly loopWindow: number;
  private readonly loopThreshold: number;
  private readonly stallTimeoutMs: number;
  private readonly contextWarningThreshold: number;
  private readonly maxContextTokens: number;

  /** Cumulative input tokens consumed across all turns in the session. */
  private totalInputTokens = 0;
  /** Cumulative output tokens produced across all turns in the session. */
  private totalOutputTokens = 0;
  /** Estimated total cost in USD based on reported token usage. */
  private totalEstimatedCostUsd = 0;
  /** Whether the context warning has already been emitted for this session. */
  private contextWarningSent = false;

  constructor(config?: StreamObserverConfig) {
    const now = Date.now();
    this.lastToolUseTime = now;
    this.lastTextTime = now;
    this.loopWindow = config?.loopWindow ?? LOOP_WINDOW;
    this.loopThreshold = config?.loopThreshold ?? LOOP_THRESHOLD;
    this.stallTimeoutMs = config?.stallTimeoutMs ?? STALL_TIMEOUT_MS;
    this.contextWarningThreshold =
      config?.contextWarningThreshold ?? DEFAULT_CONTEXT_WARNING_THRESHOLD;
    this.maxContextTokens = config?.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
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
   * Record token usage for the current turn.
   * Called by stream processors when usage metadata is available.
   * Accumulates cumulative totals for the session.
   */
  onTokenUsage(inputTokens: number, outputTokens: number, estimatedCostUsd = 0): void {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.totalEstimatedCostUsd += estimatedCostUsd;
  }

  /**
   * Returns current context window utilization metrics for this session.
   */
  getContextMetrics(): ContextMetrics {
    const contextUsagePercent =
      this.maxContextTokens > 0 ? Math.min(1.0, this.totalInputTokens / this.maxContextTokens) : 0;
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      estimatedCostUsd: this.totalEstimatedCostUsd,
      contextUsagePercent,
    };
  }

  /**
   * Returns a context warning signal when the session's input token count
   * exceeds the configured contextWarningThreshold fraction of the context window.
   *
   * The warning is emitted at most once per session to avoid repeat advisories.
   * Callers should inject the message text into the agent's next conversation turn.
   */
  shouldWarnContext(): ContextWarningSignal {
    if (this.contextWarningSent) return { warn: false };

    const contextUsagePercent =
      this.maxContextTokens > 0 ? this.totalInputTokens / this.maxContextTokens : 0;

    if (contextUsagePercent >= this.contextWarningThreshold) {
      this.contextWarningSent = true;
      const percentDisplay = Math.round(contextUsagePercent * 100);
      logger.warn(
        `Context usage at ${percentDisplay}% — emitting wrap-up advisory (threshold: ${Math.round(this.contextWarningThreshold * 100)}%)`
      );
      return {
        warn: true,
        message: `[CONTEXT ADVISORY] You have consumed approximately ${percentDisplay}% of the available context window. Please wrap up your current task now. Commit any completed work, then either finish the remaining work or decompose it into smaller follow-up features rather than continuing in this session.`,
      };
    }

    return { warn: false };
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
