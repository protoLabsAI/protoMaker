import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIProvider } from '../../src/server/providers/openai.js';
import type { ProviderConfig } from '../../src/server/types.js';

// Mock the OpenAI module
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      models = {
        list: vi.fn().mockResolvedValue({
          data: [
            { id: 'gpt-4o', object: 'model' },
            { id: 'gpt-4o-mini', object: 'model' },
            { id: 'gpt-4-turbo-preview', object: 'model' },
            { id: 'o1', object: 'model' },
            { id: 'o1-mini', object: 'model' },
          ],
        }),
      };
    },
  };
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let config: ProviderConfig;

  beforeEach(() => {
    provider = new OpenAIProvider();
    config = {
      apiKey: 'test-api-key',
      timeout: 30000,
      maxRetries: 2,
    };
  });

  describe('initialization', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(provider.initialize(config)).resolves.not.toThrow();
    });

    it('should have correct provider name', () => {
      expect(provider.name).toBe('openai');
    });

    it('should support all expected categories', () => {
      const categories = provider.getSupportedCategories();
      expect(categories).toContain('fast');
      expect(categories).toContain('balanced');
      expect(categories).toContain('quality');
      expect(categories).toContain('reasoning');
    });
  });

  describe('model definitions', () => {
    it('should have gpt-4o-mini as fast model', () => {
      const model = provider.getModel('gpt-4o-mini');
      expect(model).toBeDefined();
      expect(model?.category).toBe('fast');
      expect(model?.provider).toBe('openai');
      expect(model?.capabilities.streaming).toBe(true);
    });

    it('should have gpt-4o as balanced model', () => {
      const model = provider.getModel('gpt-4o');
      expect(model).toBeDefined();
      expect(model?.category).toBe('balanced');
      expect(model?.capabilities.functionCalling).toBe(true);
      expect(model?.capabilities.vision).toBe(true);
    });

    it('should have gpt-4-turbo as quality model', () => {
      const model = provider.getModel('gpt-4-turbo');
      expect(model).toBeDefined();
      expect(model?.category).toBe('quality');
      expect(model?.contextWindow).toBeGreaterThan(100000);
    });

    it('should have o1 as reasoning model', () => {
      const model = provider.getModel('o1');
      expect(model).toBeDefined();
      expect(model?.category).toBe('reasoning');
      expect(model?.capabilities.streaming).toBe(false);
    });

    it('should have o1-mini as reasoning model', () => {
      const model = provider.getModel('o1-mini');
      expect(model).toBeDefined();
      expect(model?.category).toBe('reasoning');
      expect(model?.contextWindow).toBeGreaterThan(100000);
    });

    it('should list all models', () => {
      const models = provider.listModels();
      expect(models.length).toBeGreaterThan(4);
    });

    it('should filter models by category', () => {
      const fastModels = provider.listModels('fast');
      expect(fastModels.every((m) => m.category === 'fast')).toBe(true);

      const reasoningModels = provider.listModels('reasoning');
      expect(reasoningModels.every((m) => m.category === 'reasoning')).toBe(true);
    });
  });

  describe('health checks', () => {
    it('should return healthy status when initialized', async () => {
      await provider.initialize(config);
      const health = await provider.checkHealth();

      expect(health.provider).toBe('openai');
      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it('should return unhealthy status when not initialized', async () => {
      const health = await provider.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  describe('metrics tracking', () => {
    it('should track metrics after health check', async () => {
      await provider.initialize(config);
      await provider.checkHealth();

      const metrics = provider.getMetrics();
      expect(metrics.requestCount).toBe(1);
      expect(metrics.lastRequestTime).toBeInstanceOf(Date);
    });

    it('should accumulate metrics across multiple health checks', async () => {
      await provider.initialize(config);
      await provider.checkHealth();
      await provider.checkHealth();
      await provider.checkHealth();

      const metrics = provider.getMetrics();
      expect(metrics.requestCount).toBe(3);
    });
  });

  describe('model pricing validation', () => {
    it('should have valid pricing for all models', () => {
      const models = provider.listModels();
      for (const model of models) {
        expect(model.pricing.input).toBeGreaterThanOrEqual(0);
        expect(model.pricing.output).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('model capabilities validation', () => {
    it('should validate all models have required capabilities', () => {
      const models = provider.listModels();
      for (const model of models) {
        expect(model.capabilities).toBeDefined();
        expect(typeof model.capabilities.streaming).toBe('boolean');
        expect(typeof model.capabilities.functionCalling).toBe('boolean');
        expect(typeof model.capabilities.vision).toBe('boolean');
      }
    });
  });
});
