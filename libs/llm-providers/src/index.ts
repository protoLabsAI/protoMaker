/**
 * @protolabs-ai/llm-providers
 *
 * Multi-provider LLM abstraction layer for AutoMaker.
 * Provides a unified interface for Anthropic, OpenAI, Google, Groq, Ollama, and Bedrock.
 *
 * Note: Three independent base classes exist from parallel feature development.
 * - BaseLLMProvider (config-based) — server/providers/base.ts
 * - BaseLLMProviderLangChain (LangChain-based) — server/base.ts
 * - BaseProvider (@protolabs-ai/types-based) — server/providers/base-provider.ts
 * - RuntimeBaseProvider (inline types) — server/types.ts
 */

// Base provider classes
export { BaseLLMProvider } from './server/providers/base.js';
export { BaseLLMProvider as BaseLLMProviderLangChain } from './server/base.js';
export { BaseProvider } from './server/providers/base-provider.js';

// LangChain base types
export type { ModelTier, LLMProviderConfig, ModelInfo, HealthCheckResult } from './server/base.js';

// Config types (prefixed to avoid clash with runtime types)
export type {
  ModelCategory as ConfigModelCategory,
  ProviderName,
  ProviderConfig as ConfigProviderConfig,
  ModelMapping,
  LLMProvidersConfig,
} from './server/config/types.js';

// Config schemas and validators
export {
  modelCategorySchema,
  providerNameSchema,
  modelMappingSchema,
  providerConfigSchema,
  llmProvidersConfigSchema,
  validateProviderConfig,
  validateLLMProvidersConfig,
} from './server/config/schema.js';

// Default model configs
export { ANTHROPIC_MODELS, getModelIdForTier } from './server/config/default-config.js';

// Runtime provider types (primary ModelCategory and ProviderConfig)
export type {
  ModelCategory,
  ModelCapabilities,
  ModelPricing,
  ModelDefinition,
  ProviderHealthStatus,
  LLMProvider,
  ProviderConfig,
  ProviderMetrics,
} from './server/types.js';
// Note: BaseProvider from server/types.ts exported as RuntimeBaseProvider to avoid clash
export { BaseProvider as RuntimeBaseProvider } from './server/types.js';

// Provider factory
export { ProviderFactory } from './server/factory/provider-factory.js';

// Provider implementations
export { AnthropicProvider } from './server/providers/anthropic.js';
export { OpenAIProvider } from './server/providers/openai.js';
export { GoogleProvider } from './server/providers/google.js';
export { GroqProvider } from './server/providers/groq.js';
export { OllamaProvider } from './server/providers/ollama.js';
export { BedrockProvider } from './server/providers/bedrock.js';
