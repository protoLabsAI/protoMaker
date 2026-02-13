/**
 * @automaker/llm-providers
 *
 * Multi-provider LLM abstraction layer for AutoMaker.
 * Provides a unified interface for Anthropic, OpenAI, Google, Groq, Ollama, and Bedrock.
 */

// Base provider classes
export { BaseLLMProvider } from './server/providers/base.js';
export { BaseLLMProvider as BaseLLMProviderLangChain } from './server/base.js';
export { BaseProvider } from './server/providers/base-provider.js';

// Config types and schemas
export * from './server/config/types.js';
export * from './server/config/schema.js';
export * from './server/config/default-config.js';
export * from './server/types.js';

// Provider factory
export * from './server/factory/provider-factory.js';

// Provider implementations
export { AnthropicProvider } from './server/providers/anthropic.js';
export { OpenAIProvider } from './server/providers/openai.js';
export { GoogleProvider } from './server/providers/google.js';
export { GroqProvider } from './server/providers/groq.js';
export { OllamaProvider } from './server/providers/ollama.js';
export { BedrockProvider } from './server/providers/bedrock.js';
