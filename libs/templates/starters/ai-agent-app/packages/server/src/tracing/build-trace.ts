/**
 * Converts raw AI SDK step data into a Trace record.
 *
 * Cost estimates are based on publicly available pricing as of 2025.
 * Update MODEL_COSTS when pricing changes.
 */

import type { Trace, TraceStep, TraceToolCall } from './types.js';

// ── Per-token pricing (USD) ───────────────────────────────────────────────────
// Format: { input: $/token, output: $/token }

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Anthropic Claude
  'claude-opus-4-6': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-sonnet-4-5': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-3-5': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  'claude-3-5-sonnet-20241022': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-3-5-haiku-20241022': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  // OpenAI
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  // Google
  'gemini-2.0-flash': { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
};

/** Default per-token cost when the model is unknown (Sonnet pricing). */
const DEFAULT_COSTS = { input: 3 / 1_000_000, output: 15 / 1_000_000 };

function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = MODEL_COSTS[model] ?? DEFAULT_COSTS;
  return inputTokens * rates.input + outputTokens * rates.output;
}

// ── Step data shape from AI SDK v6 ────────────────────────────────────────────

export interface StepData {
  text: string;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }>;
  toolResults: Array<{
    toolCallId: string;
    toolName: string;
    result: unknown;
  }>;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a Trace from the data returned by streamText's `onFinish` callback.
 *
 * @param id        - Unique ID to assign to this trace (caller-generated UUID).
 * @param model     - Resolved model ID (e.g. "claude-opus-4-6").
 * @param startedAt - When the request started.
 * @param endedAt   - When the request finished (onFinish fires).
 * @param steps     - Steps array from streamText's onFinish event.
 */
export function buildTrace(
  id: string,
  model: string,
  startedAt: Date,
  endedAt: Date,
  steps: StepData[],
): Trace {
  const totalDurationMs = endedAt.getTime() - startedAt.getTime();

  // Distribute total duration evenly across steps (AI SDK v6 doesn't expose
  // per-step wall-clock timings, so this is a reasonable approximation).
  const msPerStep = steps.length > 0 ? totalDurationMs / steps.length : totalDurationMs;

  const traceSteps: TraceStep[] = steps.map((step, index): TraceStep => {
    const inputTokens = step.usage.inputTokens ?? 0;
    const outputTokens = step.usage.outputTokens ?? 0;
    const total = inputTokens + outputTokens;
    const costUsd = computeCost(model, inputTokens, outputTokens);

    // Match tool calls with their results
    const toolCalls: TraceToolCall[] = step.toolCalls.map((tc): TraceToolCall => {
      const result = step.toolResults.find((tr) => tr.toolCallId === tc.toolCallId);
      return {
        id: tc.toolCallId,
        name: tc.toolName,
        input: tc.input,
        output: result?.result ?? null,
        // Tool execution is ~30% of step time (rough heuristic)
        durationMs: Math.round(msPerStep * 0.3),
      };
    });

    // Derive step type from content (AI SDK v6 doesn't expose stepType as a string)
    const type = toolCalls.length > 0 ? 'tool-result' : 'text';

    return {
      index,
      type,
      text: step.text,
      durationMs: Math.round(msPerStep),
      tokens: { input: inputTokens, output: outputTokens, total },
      costUsd,
      toolCalls,
    };
  });

  // Roll up totals
  const totalInputTokens = traceSteps.reduce((s, step) => s + step.tokens.input, 0);
  const totalOutputTokens = traceSteps.reduce((s, step) => s + step.tokens.output, 0);
  const totalCostUsd = traceSteps.reduce((s, step) => s + step.costUsd, 0);
  const totalToolCalls = traceSteps.reduce((s, step) => s + step.toolCalls.length, 0);

  return {
    id,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: totalDurationMs,
    model,
    totals: {
      durationMs: totalDurationMs,
      tokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens,
      },
      costUsd: totalCostUsd,
      steps: traceSteps.length,
      toolCalls: totalToolCalls,
    },
    steps: traceSteps,
  };
}
