/**
 * Model category types for provider abstraction
 */
export type ModelCategory = 'fast' | 'smart' | 'reasoning' | 'vision' | 'coding';

/**
 * Provider name types
 */
export type ProviderName = 'anthropic' | 'openai' | 'google' | 'ollama' | 'groq' | 'bedrock';

/**
 * Base provider configuration
 */
export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
  models: ModelMapping;
}

/**
 * Model mapping for each category
 */
export interface ModelMapping {
  fast?: string;
  smart?: string;
  reasoning?: string;
  vision?: string;
  coding?: string;
}

/**
 * Complete provider configuration
 */
export interface LLMProvidersConfig {
  providers: {
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
    google?: ProviderConfig;
    ollama?: ProviderConfig;
    groq?: ProviderConfig;
    bedrock?: ProviderConfig;
  };
  defaultProvider: ProviderName;
}
