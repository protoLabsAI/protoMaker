import type { ModelCategory, ProviderConfig } from '../config/types.js';

/**
 * Abstract base class for LLM providers
 * All provider implementations must extend this class
 */
export abstract class BaseLLMProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Get the provider name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Check if the provider is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the API key for this provider
   */
  getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  /**
   * Get the base URL for this provider
   */
  getBaseUrl(): string | undefined {
    return this.config.baseUrl;
  }

  /**
   * Get model name for a specific category
   */
  getModelForCategory(category: ModelCategory): string | undefined {
    return this.config.models[category];
  }

  /**
   * Check if provider supports a specific model category
   */
  supportsCategory(category: ModelCategory): boolean {
    return this.config.models[category] !== undefined;
  }

  /**
   * Get all supported categories
   */
  getSupportedCategories(): ModelCategory[] {
    return Object.keys(this.config.models).filter(
      (key) => this.config.models[key as ModelCategory] !== undefined
    ) as ModelCategory[];
  }

  /**
   * Abstract method to create a model instance
   * Must be implemented by concrete provider classes
   */
  abstract createModel(category: ModelCategory, options?: Record<string, unknown>): unknown;

  /**
   * Abstract method to initialize the provider
   * Called during provider setup
   */
  abstract initialize(): Promise<void>;

  /**
   * Abstract method to validate provider configuration
   * Called before initialization
   */
  abstract validateConfig(): void;
}
