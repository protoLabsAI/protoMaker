/**
 * Base LLM Provider abstract class
 *
 * This provides a simple abstraction over LangChain chat models,
 * allowing for easy swapping between different LLM providers.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * Model tier for capability-based selection
 */
export type ModelTier = 'fast' | 'smart' | 'creative';

/**
 * Configuration for LLM providers
 */
export interface LLMProviderConfig {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  name: string;
  tier: ModelTier;
  contextWindow: number;
  maxOutputTokens: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  provider: string;
  error?: string;
  latencyMs?: number;
}

/**
 * Abstract base class for LLM providers
 */
export abstract class BaseLLMProvider {
  protected config: LLMProviderConfig;

  constructor(config: LLMProviderConfig = {}) {
    this.config = config;
  }

  /**
   * Get provider name (e.g., "anthropic", "openai")
   */
  abstract getName(): string;

  /**
   * Get a chat model instance for the given tier
   * @param tier Model tier (fast/smart/creative)
   * @returns LangChain chat model instance
   */
  abstract getModel(tier: ModelTier): BaseChatModel;

  /**
   * List all available models for this provider
   */
  abstract listAvailableModels(): ModelInfo[];

  /**
   * Perform a health check to verify the provider is configured correctly
   */
  abstract healthCheck(): Promise<HealthCheckResult>;

  /**
   * Get the configuration
   */
  getConfig(): LLMProviderConfig {
    return this.config;
  }

  /**
   * Update the configuration
   */
  setConfig(config: Partial<LLMProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
