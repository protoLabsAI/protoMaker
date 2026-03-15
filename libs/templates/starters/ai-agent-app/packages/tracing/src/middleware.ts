/**
 * Provider tracing middleware.
 *
 * Wrap any async-generator-based provider invocation with `wrapProviderWithTracing`
 * to automatically record traces, generations, and per-tool spans.
 *
 * Supports both Langfuse (remote) and FileTracer (local) backends via the
 * `TracingClientInterface`.
 *
 * ## Example
 * ```ts
 * const tracingConfig = await createTracingConfig();
 *
 * // Wrap your model call
 * const stream = wrapProviderWithTracing(
 *   anthropic.messages.stream({ model, messages }),
 *   tracingConfig,
 *   { model: 'claude-opus-4-5', traceId: sessionId, input: messages }
 * );
 * for await (const chunk of stream) { ... }
 * ```
 */

import { randomUUID } from 'node:crypto';
import type { TracingClientInterface, CreateGenerationOptions, Logger } from './types.js';

const TOOL_SPAN_MAX_BYTES = 2048;

interface PendingToolCall {
  toolName: string;
  toolInput: unknown;
  startTime: Date;
  turnIndex: number;
  toolCallIndex: number;
}

function truncateForSpan(value: unknown): { value: string; truncated?: true } {
  const serialized = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  if (serialized.length <= TOOL_SPAN_MAX_BYTES) return { value: serialized };
  return { value: serialized.slice(0, TOOL_SPAN_MAX_BYTES), truncated: true };
}

// ---------------------------------------------------------------------------
// TracingConfig
// ---------------------------------------------------------------------------

/**
 * Configuration passed to `wrapProviderWithTracing`.
 *
 * The `client` field accepts any `TracingClientInterface` implementation —
 * use `LangfuseClient` for remote tracing or `FileTracer` for local JSON
 * file tracing (the default when Langfuse env vars are not set).
 */
export interface TracingConfig {
  /** Set to `false` to disable all tracing (passes the stream through unchanged). */
  enabled: boolean;
  /** Tracing backend.  Accepts `LangfuseClient` or `FileTracer`. */
  client?: TracingClientInterface;
  /** Logger for tracing internals.  Defaults to `console`. */
  logger?: Logger;
  /** Tags added to every trace. */
  defaultTags?: string[];
  /** Metadata merged into every trace. */
  defaultMetadata?: Record<string, unknown>;
  /**
   * Custom pricing per 1 M tokens.  Keys are substrings matched against the
   * model name (case-insensitive, first match wins).
   *
   * Overrides the built-in table returned by `calculateCost`.
   */
  pricing?: Record<string, { input: number; output: number }>;
}

// ---------------------------------------------------------------------------
// TracingContext (for manual instrumentation)
// ---------------------------------------------------------------------------

export interface TracingContext {
  traceId: string;
  generationId: string;
  startTime: Date;
  metadata?: Record<string, unknown>;
}

export interface TracedInvocationResult<T> {
  result: T;
  traceId: string;
  generationId: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Token usage helpers
// ---------------------------------------------------------------------------

function extractUsageFromMessages(
  messages: unknown[]
): { promptTokens: number; completionTokens: number; totalTokens: number } | undefined {
  let promptTokens = 0;
  let completionTokens = 0;

  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    const usage = m['usage'] as Record<string, number> | undefined;
    if (usage) {
      promptTokens += usage['input_tokens'] ?? usage['promptTokens'] ?? 0;
      completionTokens += usage['output_tokens'] ?? usage['completionTokens'] ?? 0;
    }
    const tokenUsage = m['token_usage'] as Record<string, number> | undefined;
    if (tokenUsage) {
      promptTokens += tokenUsage['prompt_tokens'] ?? 0;
      completionTokens += tokenUsage['completion_tokens'] ?? 0;
    }
  }

  const totalTokens = promptTokens + completionTokens;
  if (totalTokens === 0) return undefined;
  return { promptTokens, completionTokens, totalTokens };
}

// ---------------------------------------------------------------------------
// Pricing table
// ---------------------------------------------------------------------------

/**
 * Built-in pricing table (per 1 M tokens, USD, as of early 2026).
 *
 * Keys are substrings matched case-insensitively against the model ID.
 * **Order matters**: more-specific keys must appear before less-specific ones
 * (e.g. `"gpt-4o-mini"` before `"gpt-4o"`).
 */
const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  // Claude
  'claude-opus-4-6': { input: 15, output: 75 },
  'opus-4-6': { input: 15, output: 75 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  'haiku-4-5': { input: 0.8, output: 4 },

  // OpenAI — more-specific entries first
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'o3-mini': { input: 1.1, output: 4.4 },

  // Google Gemini
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash-lite': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },

  // Groq
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
  'gemma2-9b-it': { input: 0.2, output: 0.2 },
};

/**
 * Calculate the estimated cost in USD for a model invocation.
 *
 * Returns `undefined` when the model is not in the pricing table and no
 * `customPricing` override matches.
 *
 * @param model - Model identifier (case-insensitive substring match)
 * @param usage - Token counts
 * @param customPricing - Optional overrides merged on top of the built-in table
 */
export function calculateCost(
  model: string,
  usage?: { promptTokens: number; completionTokens: number },
  customPricing?: Record<string, { input: number; output: number }>
): number | undefined {
  if (!usage) return undefined;

  const modelLower = model.toLowerCase();
  const pricing = { ...DEFAULT_PRICING, ...customPricing };

  let prices: { input: number; output: number } | undefined;
  for (const [key, value] of Object.entries(pricing)) {
    if (modelLower.includes(key)) {
      prices = value;
      break;
    }
  }

  if (!prices) return undefined;

  const inputCost = (usage.promptTokens / 1_000_000) * prices.input;
  const outputCost = (usage.completionTokens / 1_000_000) * prices.output;
  return inputCost + outputCost;
}

// ---------------------------------------------------------------------------
// wrapProviderWithTracing
// ---------------------------------------------------------------------------

/**
 * Wrap an async-generator provider invocation with automatic tracing.
 *
 * Yields all messages unchanged while recording a trace + generation span
 * (and per-tool-call child spans) to the configured backend.  When
 * `config.enabled` is `false` or no client is available the generator is
 * passed through without any overhead.
 */
export async function* wrapProviderWithTracing<T>(
  generator: AsyncGenerator<T>,
  config: TracingConfig,
  options: {
    model: string;
    traceId?: string;
    traceName?: string;
    sessionId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
    input?: unknown;
  }
): AsyncGenerator<T> {
  const log = config.logger ?? console;

  if (!config.enabled || !config.client || !config.client.isAvailable()) {
    yield* generator;
    return;
  }

  const client = config.client;
  const traceId = options.traceId ?? randomUUID();
  const generationId = randomUUID();
  const startTime = new Date();

  client.createTrace({
    id: traceId,
    name: options.traceName ?? `model:${options.model}`,
    userId: options.userId,
    sessionId: options.sessionId,
    metadata: {
      model: options.model,
      ...config.defaultMetadata,
      ...options.metadata,
    },
    tags: [...(config.defaultTags ?? []), ...(options.tags ?? [])],
  });

  const messages: T[] = [];
  let error: Error | undefined;
  let turnIndex = -1;
  const pendingToolCalls = new Map<string, PendingToolCall>();

  try {
    for await (const message of generator) {
      messages.push(message);
      yield message;

      const msg = message as Record<string, unknown>;

      // Track tool-use blocks so we can create per-call spans
      if (
        msg['type'] === 'assistant' &&
        Array.isArray((msg['message'] as Record<string, unknown>)?.['content'])
      ) {
        turnIndex++;
        let toolCallIndex = 0;
        for (const block of (msg['message'] as Record<string, unknown>)['content'] as unknown[]) {
          const b = block as Record<string, unknown>;
          if (b['type'] === 'tool_use' && b['id']) {
            pendingToolCalls.set(b['id'] as string, {
              toolName: (b['name'] as string) ?? 'unknown',
              toolInput: b['input'],
              startTime: new Date(),
              turnIndex,
              toolCallIndex,
            });
            toolCallIndex++;
          }
        }
      } else if (
        msg['type'] === 'user' &&
        Array.isArray((msg['message'] as Record<string, unknown>)?.['content'])
      ) {
        for (const block of (msg['message'] as Record<string, unknown>)['content'] as unknown[]) {
          const b = block as Record<string, unknown>;
          if (b['type'] === 'tool_result' && b['tool_use_id']) {
            const pending = pendingToolCalls.get(b['tool_use_id'] as string);
            if (pending) {
              pendingToolCalls.delete(b['tool_use_id'] as string);
              const endTime = new Date();
              const inputResult = truncateForSpan(pending.toolInput);
              const outputResult = truncateForSpan(b['content']);
              client.createSpan({
                traceId,
                name: `tool:${pending.toolName}`,
                input: {
                  toolName: pending.toolName,
                  toolInput: inputResult.value,
                  ...(inputResult.truncated ? { truncated: true } : {}),
                },
                output: {
                  result: outputResult.value,
                  ...(outputResult.truncated ? { truncated: true } : {}),
                },
                metadata: {
                  turnIndex: pending.turnIndex,
                  toolCallIndex: pending.toolCallIndex,
                },
                startTime: pending.startTime,
                endTime,
              });
            }
          }
        }
      }
    }
  } catch (err) {
    error = err as Error;
    log.error?.('[tracing] Error in provider invocation', err);
    throw err;
  } finally {
    const endTime = new Date();
    const latencyMs = endTime.getTime() - startTime.getTime();

    const usage = extractUsageFromMessages(messages as unknown[]);
    const cost = calculateCost(
      options.model,
      usage,
      config.pricing as Record<string, { input: number; output: number }> | undefined
    );

    const generationMetadata: Record<string, unknown> = {
      latencyMs,
      messageCount: messages.length,
      ...config.defaultMetadata,
      ...options.metadata,
    };

    if (cost !== undefined) {
      generationMetadata['cost'] = cost;
      generationMetadata['costCurrency'] = 'USD';
    }

    if (error) {
      generationMetadata['error'] = error.message;
      generationMetadata['errorStack'] = error.stack;
    }

    const generationOptions: CreateGenerationOptions = {
      id: generationId,
      traceId,
      name: `generation:${options.model}`,
      model: options.model,
      input: options.input,
      output: messages.length > 0 ? messages[messages.length - 1] : undefined,
      usage: usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          }
        : undefined,
      metadata: generationMetadata,
      startTime,
      endTime,
    };

    client.createGeneration(generationOptions);

    client.updateTrace(traceId, {
      input: options.input,
      output: messages.length > 0 ? messages[messages.length - 1] : undefined,
    });

    await client.flush();

    log.debug?.('[tracing] invocation traced', {
      traceId,
      generationId,
      latencyMs,
      usage,
      cost,
    });
  }
}

// ---------------------------------------------------------------------------
// Manual instrumentation helpers
// ---------------------------------------------------------------------------

/**
 * Create a tracing context for manual (non-generator) instrumentation.
 *
 * Call `createTracingContext`, do your work, then `completeTracingContext`.
 */
export function createTracingContext(
  client: TracingClientInterface,
  options: {
    traceName?: string;
    sessionId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  } = {}
): TracingContext {
  const traceId = randomUUID();
  const generationId = randomUUID();
  const startTime = new Date();

  if (client.isAvailable()) {
    client.createTrace({
      id: traceId,
      name: options.traceName ?? 'manual-trace',
      userId: options.userId,
      sessionId: options.sessionId,
      metadata: options.metadata,
      tags: options.tags,
    });
  }

  return { traceId, generationId, startTime, metadata: options.metadata };
}

/**
 * Finalize a manually-instrumented trace.
 */
export async function completeTracingContext(
  client: TracingClientInterface,
  context: TracingContext,
  options: {
    model: string;
    input?: unknown;
    output?: unknown;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    error?: Error;
  }
): Promise<void> {
  if (!client.isAvailable()) return;

  const endTime = new Date();
  const latencyMs = endTime.getTime() - context.startTime.getTime();
  const cost = calculateCost(options.model, options.usage);

  const generationMetadata: Record<string, unknown> = {
    latencyMs,
    ...context.metadata,
  };
  if (cost !== undefined) {
    generationMetadata['cost'] = cost;
    generationMetadata['costCurrency'] = 'USD';
  }
  if (options.error) {
    generationMetadata['error'] = options.error.message;
    generationMetadata['errorStack'] = options.error.stack;
  }

  client.createGeneration({
    id: context.generationId,
    traceId: context.traceId,
    name: `generation:${options.model}`,
    model: options.model,
    input: options.input,
    output: options.output,
    usage: options.usage,
    metadata: generationMetadata,
    startTime: context.startTime,
    endTime,
  });

  client.updateTrace(context.traceId, {
    input: options.input,
    output: options.output,
  });

  await client.flush();
}
