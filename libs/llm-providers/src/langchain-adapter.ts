/**
 * LangChain adapter for the protoLabs provider system.
 *
 * Provides createLangChainModel() which maps a PhaseModelEntry to the
 * appropriate LangChain BaseChatModel by routing through ProviderFactory.
 */

import type { PhaseModelEntry } from '@protolabs-ai/types';
import { isClaudeModel } from '@protolabs-ai/types';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';

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
   * @returns A LangChain-compatible BaseChatModel
   * @throws Error if the model ID is not supported by any registered LangChain provider
   */
  static getProviderForModel(entry: PhaseModelEntry, options?: AdapterOptions): BaseChatModel {
    const { model } = entry;

    if (isClaudeModel(model)) {
      return new ChatAnthropic({
        model,
        temperature: options?.temperature ?? 0,
        streaming: options?.streaming ?? true,
        ...(options?.maxTokens !== undefined && { maxTokens: options.maxTokens }),
      });
    }

    throw new Error(
      `Unsupported model: "${model}". No LangChain adapter is available for this provider. ` +
        `Supported providers: claude (claude-*, sonnet, haiku, opus).`
    );
  }
}

/**
 * Creates a LangChain-compatible BaseChatModel for the given model configuration.
 *
 * Routes through ProviderFactory to select the appropriate LangChain model class
 * based on the model ID in the PhaseModelEntry.
 *
 * @param entry - Model configuration (model ID, optional providerId, thinkingLevel)
 * @param options - Adapter options (temperature, streaming, maxTokens)
 * @returns A LangChain BaseChatModel with invoke, stream, and tool_call support
 *
 * @example
 * const model = createLangChainModel({ model: 'claude-sonnet-4-6' });
 * const response = await model.invoke([{ role: 'user', content: 'Hello' }]);
 */
export function createLangChainModel(
  entry: PhaseModelEntry,
  options?: AdapterOptions
): BaseChatModel {
  return ProviderFactory.getProviderForModel(entry, options);
}
