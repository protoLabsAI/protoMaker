/**
 * LangChain adapter for the protoLabs provider system.
 *
 * Provides createLangChainModel() which maps a PhaseModelEntry to the
 * appropriate LangChain BaseChatModel by routing through ProviderFactory.
 *
 * When a flowId and settingsService are provided, the adapter:
 * 1. Reads the model entry from flowModels[flowId] (falls back to the supplied entry)
 * 2. Attaches a Langfuse tracing callback that emits generation spans with
 *    flowId, model, and token usage attributes.
 */

import type { PhaseModelEntry, PhaseModelConfig } from '@protolabs-ai/types';
import { isClaudeModel } from '@protolabs-ai/types';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { Serialized } from '@langchain/core/load/serializable';
import { ChatAnthropic } from '@langchain/anthropic';
import { Langfuse } from 'langfuse';

/**
 * Options for the LangChain adapter.
 */
export interface AdapterOptions {
  /** Sampling temperature (default: 0) */
  temperature?: number;
  /** Enable streaming (default: true) */
  streaming?: boolean;
  /** Maximum tokens in response */
  maxTokens?: number;
}

/**
 * Minimal interface for a settings provider that exposes flow model configuration.
 * Uses duck typing so server-side SettingsService satisfies this without a direct import.
 */
export interface FlowModelSettingsProvider {
  /** Returns the current PhaseModelConfig, or undefined if unavailable */
  getPhaseModels?(): PhaseModelConfig | undefined;
}

// ─── Lazy Langfuse singleton ─────────────────────────────────────────────────

let langfuseClient: Langfuse | null | undefined = undefined; // undefined = not yet attempted

/**
 * Returns a lazily-initialized Langfuse client using env vars.
 * Returns null when credentials are not configured.
 */
function getLangfuseClient(): Langfuse | null {
  if (langfuseClient !== undefined) {
    return langfuseClient;
  }

  const publicKey = typeof process !== 'undefined' ? process.env.LANGFUSE_PUBLIC_KEY : undefined;
  const secretKey = typeof process !== 'undefined' ? process.env.LANGFUSE_SECRET_KEY : undefined;

  if (!publicKey || !secretKey) {
    langfuseClient = null;
    return null;
  }

  try {
    const baseUrl =
      typeof process !== 'undefined'
        ? (process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com')
        : 'https://cloud.langfuse.com';

    langfuseClient = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
      flushAt: 1,
      flushInterval: 1000,
    });
  } catch {
    langfuseClient = null;
  }

  return langfuseClient;
}

// ─── Flow Tracing Callback ────────────────────────────────────────────────────

/**
 * LangChain callback handler that emits Langfuse generation spans for flow LLM calls.
 * Tracks start time per runId and creates a Langfuse generation on completion with
 * flowId, model, and token usage (cost) attributes.
 */
class FlowTracingHandler extends BaseCallbackHandler {
  name = 'FlowTracingHandler';

  private readonly flowId: string;
  private readonly modelId: string;
  private readonly client: Langfuse;
  private readonly startTimes = new Map<string, Date>();

  constructor(flowId: string, modelId: string, client: Langfuse) {
    super();
    this.flowId = flowId;
    this.modelId = modelId;
    this.client = client;
  }

  override handleLLMStart(_llm: Serialized, _prompts: string[], runId: string): void {
    this.startTimes.set(runId, new Date());
  }

  override handleLLMEnd(output: LLMResult, runId: string): void {
    const startTime = this.startTimes.get(runId) ?? new Date();
    this.startTimes.delete(runId);

    const tokenUsage = output.llmOutput?.tokenUsage as
      | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
      | undefined;

    const traceId = `flow-${this.flowId}-${runId}`;
    const trace = this.client.trace({
      id: traceId,
      name: `flow:${this.flowId}`,
      metadata: { flowId: this.flowId, model: this.modelId },
    });

    trace.generation({
      name: `${this.flowId}:llm`,
      model: this.modelId,
      startTime,
      endTime: new Date(),
      output: output.generations?.[0]?.[0]?.text,
      usage: tokenUsage
        ? {
            input: tokenUsage.promptTokens,
            output: tokenUsage.completionTokens,
            total: tokenUsage.totalTokens,
          }
        : undefined,
      metadata: { flowId: this.flowId, model: this.modelId },
    });
  }
}

/**
 * Creates a FlowTracingHandler if Langfuse credentials are available.
 * Returns null when Langfuse is not configured.
 */
function createFlowTracingCallback(flowId: string, modelId: string): FlowTracingHandler | null {
  const client = getLangfuseClient();
  if (!client) {
    return null;
  }
  return new FlowTracingHandler(flowId, modelId, client);
}

// ─── Provider Factory ─────────────────────────────────────────────────────────

/**
 * Internal factory that maps a PhaseModelEntry to the correct LangChain model class.
 * Mirrors the routing logic of the server-side ProviderFactory but returns
 * LangChain BaseChatModel instances instead of BaseProvider instances.
 */
export class ProviderFactory {
  /**
   * Returns a LangChain BaseChatModel for the given model entry.
   *
   * @param entry - Model configuration including model ID and optional provider/thinking settings
   * @param options - Adapter options (temperature, streaming, maxTokens)
   * @param callbacks - Optional LangChain callback handlers (e.g. for tracing)
   * @returns A LangChain-compatible BaseChatModel
   * @throws Error if the model ID is not supported by any registered LangChain provider
   */
  static getProviderForModel(
    entry: PhaseModelEntry,
    options?: AdapterOptions,
    callbacks?: BaseCallbackHandler[]
  ): BaseChatModel {
    const { model } = entry;

    if (isClaudeModel(model)) {
      return new ChatAnthropic({
        model,
        temperature: options?.temperature ?? 0,
        streaming: options?.streaming ?? true,
        ...(options?.maxTokens !== undefined && { maxTokens: options.maxTokens }),
        ...(callbacks && callbacks.length > 0 && { callbacks }),
      });
    }

    throw new Error(
      `Unsupported model: "${model}". No LangChain adapter is available for this provider. ` +
        `Supported providers: claude (claude-*, sonnet, haiku, opus).`
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a LangChain-compatible BaseChatModel for the given model configuration.
 *
 * When settingsService and flowId are both provided:
 * - Reads the model entry from PhaseModelConfig.flowModels[flowId] (falls back to entry)
 * - Attaches Langfuse tracing callbacks that emit spans with flowId, model, and token
 *   usage attributes (only active when LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set)
 *
 * @param entry - Model configuration (model ID, optional providerId, thinkingLevel)
 * @param options - Adapter options (temperature, streaming, maxTokens)
 * @param settingsService - Optional settings provider to resolve per-flow model overrides
 * @param flowId - Optional flow identifier for model override and Langfuse span tagging
 * @returns A LangChain BaseChatModel with invoke, stream, and tool_call support
 *
 * @example
 * // Basic usage (synchronous, no flow override)
 * const model = createLangChainModel({ model: 'claude-sonnet-4-6' });
 *
 * @example
 * // Flow-aware usage with settings override and Langfuse tracing
 * const model = createLangChainModel(
 *   { model: 'claude-sonnet' },
 *   { temperature: 0 },
 *   settingsService,
 *   'content-creation'
 * );
 */
export function createLangChainModel(
  entry: PhaseModelEntry,
  options?: AdapterOptions,
  settingsService?: FlowModelSettingsProvider,
  flowId?: string
): BaseChatModel {
  // Resolve model entry: prefer flowModels[flowId] from settings when available
  let resolvedEntry = entry;
  if (flowId && settingsService?.getPhaseModels) {
    const phaseModels = settingsService.getPhaseModels();
    const flowOverride = phaseModels?.flowModels?.[flowId];
    if (flowOverride) {
      resolvedEntry = flowOverride;
    }
  }

  // Build Langfuse tracing callback if flowId is provided
  const callbacks: BaseCallbackHandler[] = [];
  if (flowId) {
    const tracingCallback = createFlowTracingCallback(flowId, resolvedEntry.model);
    if (tracingCallback) {
      callbacks.push(tracingCallback);
    }
  }

  return ProviderFactory.getProviderForModel(
    resolvedEntry,
    options,
    callbacks.length > 0 ? callbacks : undefined
  );
}
