/**
 * @protolabs-ai/llm-providers
 *
 * LangChain adapter for the protoLabs provider system.
 * Provides createLangChainModel() to map PhaseModelEntry to BaseChatModel.
 */

export { createLangChainModel, ProviderFactory } from './langchain-adapter.js';
export type { AdapterOptions, FlowModelSettingsProvider } from './langchain-adapter.js';
