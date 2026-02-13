/**
 * Anthropic LLM Provider implementation
 *
 * Provides access to Claude models via LangChain's ChatAnthropic wrapper.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseLLMProvider } from '../base.js';
import type { LLMProviderConfig, ModelTier, ModelInfo, HealthCheckResult } from '../base.js';
import { ANTHROPIC_MODELS, getModelIdForTier } from '../config/default-config.js';

/**
 * Anthropic provider implementation using LangChain
 */
export class AnthropicProvider extends BaseLLMProvider {
  private cachedHealth: HealthCheckResult | null = null;
  private cachedHealthTimestamp = 0;
  private static readonly HEALTH_CACHE_TTL_MS = 60_000; // 1 minute

  constructor(config: LLMProviderConfig = {}) {
    super(config);

    // Use provided API key or fall back to environment variable
    if (!this.config.apiKey) {
      this.config.apiKey = process.env.ANTHROPIC_API_KEY;
    }
  }

  /**
   * Get provider name
   */
  getName(): string {
    return 'anthropic';
  }

  /**
   * Get a Claude model instance for the given tier
   * @param tier Model tier (fast=haiku, smart=sonnet, creative=opus)
   */
  getModel(tier: ModelTier): BaseChatModel {
    const modelId = getModelIdForTier(tier);

    return new ChatAnthropic({
      model: modelId,
      apiKey: this.config.apiKey,
      temperature: this.config.temperature ?? 1,
      maxTokens: this.config.maxTokens ?? 8192,
    });
  }

  /**
   * List all available Anthropic models
   */
  listAvailableModels(): ModelInfo[] {
    return Object.values(ANTHROPIC_MODELS);
  }

  /**
   * Health check: verify API key is valid.
   * Uses a cached result with TTL to avoid billable model.invoke calls on every probe.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    // Return cached result if still valid
    const now = Date.now();
    if (
      this.cachedHealth &&
      now - this.cachedHealthTimestamp < AnthropicProvider.HEALTH_CACHE_TTL_MS
    ) {
      return this.cachedHealth;
    }

    // Verify API key is present (no API call needed)
    if (!this.config.apiKey) {
      const result: HealthCheckResult = {
        healthy: false,
        provider: this.getName(),
        error: 'ANTHROPIC_API_KEY not configured',
      };
      this.cachedHealth = result;
      this.cachedHealthTimestamp = now;
      return result;
    }

    const startTime = now;

    try {
      // Make a minimal test request to verify the key works
      const model = this.getModel('fast');
      await model.invoke([{ role: 'user', content: 'ping' }]);

      const latencyMs = Date.now() - startTime;
      const result: HealthCheckResult = {
        healthy: true,
        provider: this.getName(),
        latencyMs,
      };
      this.cachedHealth = result;
      this.cachedHealthTimestamp = Date.now();
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const result: HealthCheckResult = {
        healthy: false,
        provider: this.getName(),
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs,
      };
      this.cachedHealth = result;
      this.cachedHealthTimestamp = Date.now();
      return result;
    }
  }
}
