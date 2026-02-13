import type { BaseLLMProvider } from '../providers/base.js';
import type { ModelCategory, ProviderName, LLMProvidersConfig } from '../config/types.js';
import { validateLLMProvidersConfig } from '../config/schema.js';

/**
 * Factory class for creating and managing LLM providers
 * Implements singleton pattern for centralized provider management
 */
export class ProviderFactory {
  private static instance: ProviderFactory | null = null;
  private providers: Map<ProviderName, BaseLLMProvider>;
  private config: LLMProvidersConfig | null;
  private initialized: boolean;

  private constructor() {
    this.providers = new Map();
    this.config = null;
    this.initialized = false;
  }

  /**
   * Get the singleton instance of ProviderFactory
   */
  static getInstance(): ProviderFactory {
    if (!ProviderFactory.instance) {
      ProviderFactory.instance = new ProviderFactory();
    }
    return ProviderFactory.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    ProviderFactory.instance = null;
  }

  /**
   * Initialize the factory with configuration
   */
  initialize(config: unknown): void {
    // Validate configuration
    this.config = validateLLMProvidersConfig(config);
    this.initialized = true;
  }

  /**
   * Check if factory is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Register a provider instance. Factory must be initialized first.
   */
  registerProvider(name: ProviderName, provider: BaseLLMProvider): void {
    if (!this.initialized) {
      throw new Error(
        'ProviderFactory not initialized. Call initialize() before registering providers.'
      );
    }
    this.providers.set(name, provider);
  }

  /**
   * Get a provider by name
   */
  getProvider(name?: ProviderName): BaseLLMProvider {
    if (!this.initialized || !this.config) {
      throw new Error('ProviderFactory not initialized. Call initialize() first.');
    }

    const providerName = name ?? this.config.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(
        `Provider '${providerName}' not found. Available providers: ${Array.from(this.providers.keys()).join(', ')}`
      );
    }

    if (!provider.isEnabled()) {
      throw new Error(`Provider '${providerName}' is disabled`);
    }

    return provider;
  }

  /**
   * Get a model for a specific category and provider
   */
  getModel(
    category: ModelCategory,
    providerName?: ProviderName,
    options?: Record<string, unknown>
  ): unknown {
    const provider = this.getProvider(providerName);

    if (!provider.supportsCategory(category)) {
      const supportedCategories = provider.getSupportedCategories().join(', ');
      throw new Error(
        `Provider '${provider.getName()}' does not support category '${category}'. Supported categories: ${supportedCategories}`
      );
    }

    return provider.createModel(category, options);
  }

  /**
   * Get all registered providers
   */
  getProviders(): Map<ProviderName, BaseLLMProvider> {
    return new Map(this.providers);
  }

  /**
   * Get the default provider name
   */
  getDefaultProvider(): ProviderName {
    if (!this.config) {
      throw new Error('ProviderFactory not initialized');
    }
    return this.config.defaultProvider;
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(name: ProviderName): boolean {
    return this.providers.has(name);
  }

  /**
   * Clear all registered providers
   */
  clearProviders(): void {
    this.providers.clear();
  }

  /**
   * Get configuration
   */
  getConfig(): LLMProvidersConfig {
    if (!this.config) {
      throw new Error('ProviderFactory not initialized');
    }
    return this.config;
  }
}
