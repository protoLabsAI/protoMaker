/**
 * Trace data types shared between the server capture layer and the UI.
 *
 * A Trace represents one complete chat conversation request:
 *   - one or more Steps (model inference turns)
 *   - each Step may include one or more ToolCalls
 *   - token counts and cost are tracked per-step and rolled up to totals
 */

export interface TraceToolCall {
  /** The unique call ID assigned by the model. */
  id: string;
  /** Name of the tool that was called. */
  name: string;
  /** Arguments passed by the model to the tool. */
  input: unknown;
  /** Return value from the tool execution. null if not yet available. */
  output: unknown;
  /** Wall-clock time the tool execution took (approximated). */
  durationMs: number;
}

export interface TraceStep {
  /** Zero-based step index within the trace. */
  index: number;
  /** AI SDK step type: 'initial' | 'continue' | 'tool-result'. */
  type: string;
  /** Text output from the model in this step (may be empty if tool-only). */
  text: string;
  /** Approximate wall-clock duration for this step. */
  durationMs: number;
  /** Token usage for this step. */
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  /** Estimated USD cost for this step. */
  costUsd: number;
  /** Tool calls made in this step. */
  toolCalls: TraceToolCall[];
}

export interface Trace {
  /** UUID identifying this trace. */
  id: string;
  /** ISO timestamp when the request started. */
  startedAt: string;
  /** ISO timestamp when the request finished. */
  endedAt: string;
  /** Total wall-clock duration in milliseconds. */
  durationMs: number;
  /** Resolved model ID (e.g. "claude-opus-4-6"). */
  model: string;
  /** Rolled-up totals for quick display in the list view. */
  totals: {
    durationMs: number;
    tokens: {
      input: number;
      output: number;
      total: number;
    };
    costUsd: number;
    steps: number;
    toolCalls: number;
  };
  /** Per-step breakdown. */
  steps: TraceStep[];
}
