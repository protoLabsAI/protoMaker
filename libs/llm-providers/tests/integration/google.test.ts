import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleProvider } from '../../src/server/providers/google.js';
import type { ProviderConfig } from '../../src/server/types.js';

// Mock the Google Generative AI module
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
      constructor(apiKey: string) {}
      getGenerativeModel(params: { model: string }) {
        return {
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () => 'This is a mock response from Gemini',
              candidates: [
                {
                  content: {
                    parts: [{ text: 'This is a mock response from Gemini' }],
                    role: 'model',
                  },
                  finishReason: 'STOP',
                  index: 0,
                },
              ],
            },
          }),
        };
      }
    },
  };
});

describe('GoogleProvider', () => {
  let provider: GoogleProvider;
  let config: ProviderConfig;

  beforeEach(() => {
    provider = new GoogleProvider();
    config = {
      apiKey: 'test-google-api-key',
      timeout: 30000,
      maxRetries: 2,
    };
  });

  describe('initialization', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(provider.initialize(config)).resolves.not.toThrow();
    });

    it('should have correct provider name', () => {
      expect(provider.name).toBe('google');
    });

    it('should support expected categories', () => {
      const categories = provider.getSupportedCategories();
      expect(categories).toContain('fast');
      expect(categories).toContain('balanced');
      expect(categories).toContain('quality');
    });

    it('should throw error when API key is missing', async () => {
      const invalidConfig = { ...config, apiKey: undefined };
      delete process.env.GOOGLE_API_KEY;
      await expect(provider.initialize(invalidConfig)).rejects.toThrow(
        'Google API key is required'
      );
    });
  });

  describe('model definitions', () => {
    it('should have gemini-2.0-flash as fast model', () => {
      const model = provider.getModel('gemini-2.0-flash');
      expect(model).toBeDefined();
      expect(model?.category).toBe('fast');
      expect(model?.provider).toBe('google');
      expect(model?.capabilities.streaming).toBe(true);
      expect(model?.contextWindow).toBe(1000000);
    });

    it('should have gemini-1.5-flash as fast model', () => {
      const model = provider.getModel('gemini-1.5-flash');
      expect(model).toBeDefined();
      expect(model?.category).toBe('fast');
      expect(model?.capabilities.functionCalling).toBe(true);
      expect(model?.capabilities.vision).toBe(true);
    });

    it('should have gemini-1.5-pro as balanced model', () => {
      const model = provider.getModel('gemini-1.5-pro');
      expect(model).toBeDefined();
      expect(model?.category).toBe('balanced');
      expect(model?.contextWindow).toBe(2000000);
    });

    it('should have gemini-pro as quality model', () => {
      const model = provider.getModel('gemini-pro');
      expect(model).toBeDefined();
      expect(model?.category).toBe('quality');
    });

    it('should have gemini-2.0-flash-thinking as quality model', () => {
      const model = provider.getModel('gemini-2.0-flash-thinking');
      expect(model).toBeDefined();
      expect(model?.category).toBe('quality');
      expect(model?.capabilities.vision).toBe(true);
    });

    it('should list all models', () => {
      const models = provider.listModels();
      expect(models.length).toBeGreaterThan(4);
    });

    it('should filter models by category', () => {
      const fastModels = provider.listModels('fast');
      expect(fastModels.length).toBeGreaterThan(0);
      expect(fastModels.every((m) => m.category === 'fast')).toBe(true);

      const balancedModels = provider.listModels('balanced');
      expect(balancedModels.every((m) => m.category === 'balanced')).toBe(true);
    });
  });

  describe('health checks', () => {
    it('should return healthy status when initialized', async () => {
      await provider.initialize(config);
      const health = await provider.checkHealth();

      expect(health.provider).toBe('google');
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

      const metrics = provider.getMetrics();
      expect(metrics.requestCount).toBe(2);
    });

    it('should calculate average latency', async () => {
      await provider.initialize(config);
      await provider.checkHealth();
      await provider.checkHealth();

      const metrics = provider.getMetrics();
      expect(metrics.averageLatency).toBeGreaterThanOrEqual(0);
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

    it('should have free pricing for experimental models', () => {
      const flashModel = provider.getModel('gemini-2.0-flash');
      expect(flashModel?.pricing.input).toBe(0);
      expect(flashModel?.pricing.output).toBe(0);
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

    it('should have large context windows for Gemini models', () => {
      const proModel = provider.getModel('gemini-1.5-pro');
      expect(proModel?.contextWindow).toBeGreaterThan(1000000);
    });
  });
});
