import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderFactory } from '../../src/server/factory/provider-factory.js';
import { BaseLLMProvider } from '../../src/server/providers/base.js';
import type { ProviderConfig, ModelCategory } from '../../src/server/config/types.js';

/**
 * Mock provider for testing
 */
class MockProvider extends BaseLLMProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  createModel(category: ModelCategory, options?: Record<string, unknown>): unknown {
    return {
      category,
      model: this.getModelForCategory(category),
      options,
    };
  }

  async initialize(): Promise<void> {
    // Mock initialization
  }

  validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('API key is required');
    }
  }
}

describe('ProviderFactory', () => {
  let factory: ProviderFactory;

  beforeEach(() => {
    // Reset singleton before each test
    ProviderFactory.resetInstance();
    factory = ProviderFactory.getInstance();
  });

  afterEach(() => {
    ProviderFactory.resetInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = ProviderFactory.getInstance();
      const instance2 = ProviderFactory.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = ProviderFactory.getInstance();
      ProviderFactory.resetInstance();
      const instance2 = ProviderFactory.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Initialization', () => {
    it('should initialize with valid configuration', () => {
      const config = {
        providers: {
          anthropic: {
            name: 'anthropic' as const,
            apiKey: 'test-key',
            enabled: true,
            models: {
              fast: 'claude-haiku-4-5',
              smart: 'claude-sonnet-4-5',
            },
          },
        },
        defaultProvider: 'anthropic' as const,
      };

      expect(() => factory.initialize(config)).not.toThrow();
      expect(factory.isInitialized()).toBe(true);
    });

    it('should throw error on invalid configuration', () => {
      const invalidConfig = {
        providers: {},
        // Missing defaultProvider
      };

      expect(() => factory.initialize(invalidConfig)).toThrow();
    });

    it('should throw error when accessing config before initialization', () => {
      expect(() => factory.getConfig()).toThrow('ProviderFactory not initialized');
    });
  });

  describe('Provider Registration', () => {
    beforeEach(() => {
      const config = {
        providers: {
          anthropic: {
            name: 'anthropic' as const,
            apiKey: 'test-key',
            enabled: true,
            models: {
              fast: 'claude-haiku-4-5',
              smart: 'claude-sonnet-4-5',
            },
          },
        },
        defaultProvider: 'anthropic' as const,
      };
      factory.initialize(config);
    });

    it('should register a provider', () => {
      const mockProvider = new MockProvider({
        name: 'anthropic',
        apiKey: 'test-key',
        enabled: true,
        models: { fast: 'claude-haiku-4-5' },
      });

      factory.registerProvider('anthropic', mockProvider);
      expect(factory.hasProvider('anthropic')).toBe(true);
    });

    it('should retrieve registered provider', () => {
      const mockProvider = new MockProvider({
        name: 'anthropic',
        apiKey: 'test-key',
        enabled: true,
        models: { fast: 'claude-haiku-4-5' },
      });

      factory.registerProvider('anthropic', mockProvider);
      const retrieved = factory.getProvider('anthropic');
      expect(retrieved).toBe(mockProvider);
    });

    it('should get default provider when no name specified', () => {
      const mockProvider = new MockProvider({
        name: 'anthropic',
        apiKey: 'test-key',
        enabled: true,
        models: { fast: 'claude-haiku-4-5' },
      });

      factory.registerProvider('anthropic', mockProvider);
      const retrieved = factory.getProvider();
      expect(retrieved.getName()).toBe('anthropic');
    });

    it('should throw error when provider not found', () => {
      expect(() => factory.getProvider('openai')).toThrow("Provider 'openai' not found");
    });

    it('should throw error when provider is disabled', () => {
      const mockProvider = new MockProvider({
        name: 'anthropic',
        apiKey: 'test-key',
        enabled: false,
        models: { fast: 'claude-haiku-4-5' },
      });

      factory.registerProvider('anthropic', mockProvider);
      expect(() => factory.getProvider('anthropic')).toThrow("Provider 'anthropic' is disabled");
    });
  });

  describe('Model Retrieval', () => {
    beforeEach(() => {
      const config = {
        providers: {
          anthropic: {
            name: 'anthropic' as const,
            apiKey: 'test-key',
            enabled: true,
            models: {
              fast: 'claude-haiku-4-5',
              smart: 'claude-sonnet-4-5',
            },
          },
        },
        defaultProvider: 'anthropic' as const,
      };
      factory.initialize(config);

      const mockProvider = new MockProvider({
        name: 'anthropic',
        apiKey: 'test-key',
        enabled: true,
        models: {
          fast: 'claude-haiku-4-5',
          smart: 'claude-sonnet-4-5',
        },
      });

      factory.registerProvider('anthropic', mockProvider);
    });

    it('should get model for supported category', () => {
      const model = factory.getModel('fast', 'anthropic');
      expect(model).toEqual({
        category: 'fast',
        model: 'claude-haiku-4-5',
        options: undefined,
      });
    });

    it('should pass options to model creation', () => {
      const options = { temperature: 0.7 };
      const model = factory.getModel('fast', 'anthropic', options);
      expect(model).toEqual({
        category: 'fast',
        model: 'claude-haiku-4-5',
        options,
      });
    });

    it('should use default provider when not specified', () => {
      const model = factory.getModel('smart');
      expect(model).toEqual({
        category: 'smart',
        model: 'claude-sonnet-4-5',
        options: undefined,
      });
    });

    it('should throw error for unsupported category', () => {
      expect(() => factory.getModel('vision', 'anthropic')).toThrow(
        "Provider 'anthropic' does not support category 'vision'"
      );
    });
  });

  describe('Provider Management', () => {
    beforeEach(() => {
      const config = {
        providers: {
          anthropic: {
            name: 'anthropic' as const,
            apiKey: 'test-key',
            enabled: true,
            models: { fast: 'claude-haiku-4-5' },
          },
          openai: {
            name: 'openai' as const,
            apiKey: 'test-key',
            enabled: true,
            models: { fast: 'gpt-4o-mini' },
          },
        },
        defaultProvider: 'anthropic' as const,
      };
      factory.initialize(config);
    });

    it('should get all registered providers', () => {
      const mockProvider1 = new MockProvider({
        name: 'anthropic',
        apiKey: 'test-key',
        enabled: true,
        models: { fast: 'claude-haiku-4-5' },
      });
      const mockProvider2 = new MockProvider({
        name: 'openai',
        apiKey: 'test-key',
        enabled: true,
        models: { fast: 'gpt-4o-mini' },
      });

      factory.registerProvider('anthropic', mockProvider1);
      factory.registerProvider('openai', mockProvider2);

      const providers = factory.getProviders();
      expect(providers.size).toBe(2);
      expect(providers.has('anthropic')).toBe(true);
      expect(providers.has('openai')).toBe(true);
    });

    it('should clear all providers', () => {
      const mockProvider = new MockProvider({
        name: 'anthropic',
        apiKey: 'test-key',
        enabled: true,
        models: { fast: 'claude-haiku-4-5' },
      });

      factory.registerProvider('anthropic', mockProvider);
      expect(factory.hasProvider('anthropic')).toBe(true);

      factory.clearProviders();
      expect(factory.hasProvider('anthropic')).toBe(false);
    });

    it('should get default provider name', () => {
      expect(factory.getDefaultProvider()).toBe('anthropic');
    });

    it('should check provider existence', () => {
      const mockProvider = new MockProvider({
        name: 'anthropic',
        apiKey: 'test-key',
        enabled: true,
        models: { fast: 'claude-haiku-4-5' },
      });

      expect(factory.hasProvider('anthropic')).toBe(false);
      factory.registerProvider('anthropic', mockProvider);
      expect(factory.hasProvider('anthropic')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when getting provider before initialization', () => {
      expect(() => factory.getProvider()).toThrow('ProviderFactory not initialized');
    });

    it('should throw error when getting model before initialization', () => {
      expect(() => factory.getModel('fast')).toThrow('ProviderFactory not initialized');
    });

    it('should validate configuration schema', () => {
      const invalidConfig = {
        providers: {
          anthropic: {
            name: 'invalid-provider', // Invalid provider name
            enabled: true,
            models: {},
          },
        },
        defaultProvider: 'anthropic',
      };

      expect(() => factory.initialize(invalidConfig)).toThrow();
    });
  });
});
