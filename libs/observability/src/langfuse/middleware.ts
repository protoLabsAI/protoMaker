import { randomUUID } from 'node:crypto';
import { createLogger } from '@protolabs-ai/utils';
import { LangfuseClient } from './client.js';
import type { CreateGenerationOptions } from './types.js';

export const logger = createLogger('LangfuseMiddleware');

/**
 * Configuration for provider tracing
 */
export interface TracingConfig {
  /** Whether tracing is enabled */
  enabled: boolean;
  /** Langfuse client instance */
  client?: LangfuseClient;
  /** Default tags to apply to all traces */
  defaultTags?: string[];
  /** Default metadata to apply to all traces */
  defaultMetadata?: Record<string, any>;
  /** Custom pricing per model (per 1M tokens). Key is a substring matched against model name. */
  pricing?: Record<string, { input: number; output: number }>;
}

/**
 * Context for a traced invocation
 */
export interface TracingContext {
  traceId: string;
  generationId: string;
  startTime: Date;
  metadata?: Record<string, any>;
}

/**
 * Result from a traced invocation
 */
export interface TracedInvocationResult<T> {
  result: T;
  traceId: string;
  generationId: string;
  latencyMs: number;
}

/**
 * Extract token usage from provider messages
 * Supports various message formats from different providers
 */
function extractUsageFromMessages(messages: any[]):
  | {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }
  | undefined {
  let promptTokens = 0;
  let completionTokens = 0;

  for (const msg of messages) {
    // Check for usage in message (Anthropic format)
    if (msg.usage) {
      promptTokens += msg.usage.input_tokens || msg.usage.promptTokens || 0;
      completionTokens += msg.usage.output_tokens || msg.usage.completionTokens || 0;
    }

    // Check for token_usage (alternative format)
    if (msg.token_usage) {
      promptTokens += msg.token_usage.prompt_tokens || 0;
      completionTokens += msg.token_usage.completion_tokens || 0;
    }
  }

  const totalTokens = promptTokens + completionTokens;

  if (totalTokens === 0) {
    return undefined;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

/** Default pricing per 1M tokens (as of 2026-02) */
const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  // Claude
  'opus-4-6': { input: 15, output: 75 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'opus-4-5': { input: 15, output: 75 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'haiku-4-5': { input: 0.8, output: 4 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },

  // Groq (per 1M tokens, 2026-02)
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  // deprecated on Groq; retained for legacy trace cost reconstruction
  'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
  'gemma2-9b-it': { input: 0.2, output: 0.2 }, // verify: approximate as of 2026-02

  // OpenAI (per 1M tokens, 2026-02)
  // NOTE: 'gpt-4o-mini' MUST appear before 'gpt-4o' — substring match hits first entry
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
};

export function calculateCost(
  model: string,
  usage?: { promptTokens: number; completionTokens: number },
  customPricing?: Record<string, { input: number; output: number }>
): number | undefined {
  if (!usage) return undefined;

  const modelLower = model.toLowerCase();
  const pricing = { ...DEFAULT_PRICING, ...customPricing };

  // Find matching pricing
  let prices: { input: number; output: number } | undefined;

  for (const [key, value] of Object.entries(pricing)) {
    if (modelLower.includes(key)) {
      prices = value;
      break;
    }
  }

  if (!prices) {
    logger.debug('No pricing found for model, cost will be undefined', { model });
    return undefined;
  }

  // Calculate cost (prices are per 1M tokens)
  const inputCost = (usage.promptTokens / 1_000_000) * prices.input;
  const outputCost = (usage.completionTokens / 1_000_000) * prices.output;

  return inputCost + outputCost;
}

/**
 * Wrap a provider's invoke method with Langfuse tracing
 * Returns a new async generator that yields the same messages but tracks them in Langfuse
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
    metadata?: Record<string, any>;
    tags?: string[];
    input?: any;
  }
): AsyncGenerator<T> {
  // If tracing is disabled or no client, just pass through
  if (!config.enabled || !config.client || !config.client.isAvailable()) {
    yield* generator;
    return;
  }

  const client = config.client;
  const traceId = options.traceId ?? randomUUID();
  const generationId = randomUUID();
  const startTime = new Date();

  // Create trace
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

  // Collect all messages for usage tracking
  const messages: T[] = [];
  let error: Error | undefined;

  try {
    // Yield all messages and collect them
    for await (const message of generator) {
      messages.push(message);
      yield message;
    }
  } catch (err) {
    error = err as Error;
    logger.error('Error in provider invocation', err);
    throw err;
  } finally {
    const endTime = new Date();
    const latencyMs = endTime.getTime() - startTime.getTime();

    // Extract usage from collected messages
    const usage = extractUsageFromMessages(messages);

    // Calculate cost (use custom pricing from config if provided)
    const cost = calculateCost(options.model, usage, config.pricing);

    // Prepare generation metadata
    const generationMetadata: Record<string, any> = {
      latencyMs,
      messageCount: messages.length,
      ...config.defaultMetadata,
      ...options.metadata,
    };

    if (cost !== undefined) {
      generationMetadata.cost = cost;
      generationMetadata.costCurrency = 'USD';
    }

    if (error) {
      generationMetadata.error = error.message;
      generationMetadata.errorStack = error.stack;
    }

    // Create generation span
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

    // Update parent trace with I/O for visibility in Langfuse dashboard
    client.updateTrace(traceId, {
      input: options.input,
      output: messages.length > 0 ? messages[messages.length - 1] : undefined,
    });

    // Flush events to Langfuse
    await client.flush();

    logger.debug('Traced invocation completed', {
      traceId,
      generationId,
      latencyMs,
      usage,
      cost,
    });
  }
}

/**
 * Create a tracing context for manual instrumentation
 */
export function createTracingContext(
  client: LangfuseClient,
  options: {
    traceName?: string;
    sessionId?: string;
    userId?: string;
    metadata?: Record<string, any>;
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

  return {
    traceId,
    generationId,
    startTime,
    metadata: options.metadata,
  };
}

/**
 * Complete a manual tracing context
 */
export async function completeTracingContext(
  client: LangfuseClient,
  context: TracingContext,
  options: {
    model: string;
    input?: any;
    output?: any;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    error?: Error;
  }
): Promise<void> {
  if (!client.isAvailable()) {
    return;
  }

  const endTime = new Date();
  const latencyMs = endTime.getTime() - context.startTime.getTime();

  // Calculate cost
  const cost = calculateCost(options.model, options.usage);

  const generationMetadata: Record<string, any> = {
    latencyMs,
    ...context.metadata,
  };

  if (cost !== undefined) {
    generationMetadata.cost = cost;
    generationMetadata.costCurrency = 'USD';
  }

  if (options.error) {
    generationMetadata.error = options.error.message;
    generationMetadata.errorStack = options.error.stack;
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

  // Update parent trace with I/O
  client.updateTrace(context.traceId, {
    input: options.input,
    output: options.output,
  });

  await client.flush();
}
