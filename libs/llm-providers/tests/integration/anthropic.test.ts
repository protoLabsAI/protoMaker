/**
 * Integration tests for AnthropicProvider
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { AnthropicProvider } from '../../src/server/providers/anthropic.js';

// Mock the @langchain/anthropic module
vi.mock('@langchain/anthropic', () => {
  // Mock ChatAnthropic class
  class MockChatAnthropic {
    model: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;

    constructor(config: any) {
      this.model = config.model;
      this.apiKey = config.apiKey;
      this.temperature = config.temperature;
      this.maxTokens = config.maxTokens;
    }

    async invoke(messages: any[]) {
      // Simulate some latency
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Simulate API behavior
      if (!this.apiKey || this.apiKey === 'invalid-key') {
        throw new Error(
          '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
        );
      }
      return {
        role: 'assistant',
        content: 'Mock response from Claude',
      };
    }
  }

  return {
    ChatAnthropic: MockChatAnthropic,
  };
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider({
      apiKey: 'test-api-key',
    });
  });

  describe('getName', () => {
    it('should return "anthropic" as provider name', () => {
      expect(provider.getName()).toBe('anthropic');
    });
  });

  describe('getModel', () => {
    it('should return ChatAnthropic with claude-sonnet-4-5 for "smart" tier', () => {
      const model = provider.getModel('smart');

      expect(model).toBeDefined();
      expect((model as any).model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should return ChatAnthropic with claude-haiku for "fast" tier', () => {
      const model = provider.getModel('fast');

      expect(model).toBeDefined();
      expect((model as any).model).toBe('claude-haiku-4-5-20251001');
    });

    it('should return ChatAnthropic with claude-opus for "creative" tier', () => {
      const model = provider.getModel('creative');

      expect(model).toBeDefined();
      expect((model as any).model).toBe('claude-opus-4-5-20251101');
    });

    it('should use configured temperature and maxTokens', () => {
      const customProvider = new AnthropicProvider({
        apiKey: 'test-key',
        temperature: 0.5,
        maxTokens: 4096,
      });

      const model = customProvider.getModel('smart');

      expect((model as any).temperature).toBe(0.5);
      expect((model as any).maxTokens).toBe(4096);
    });
  });

  describe('listAvailableModels', () => {
    it('should return all Anthropic models (haiku, sonnet, opus)', () => {
      const models = provider.listAvailableModels();

      expect(models).toHaveLength(3);
      expect(models.map((m) => m.tier)).toEqual(['fast', 'smart', 'creative']);
      expect(models.map((m) => m.id)).toEqual([
        'claude-haiku-4-5-20251001',
        'claude-sonnet-4-5-20250929',
        'claude-opus-4-5-20251101',
      ]);
    });

    it('should include model metadata (contextWindow, maxOutputTokens)', () => {
      const models = provider.listAvailableModels();

      models.forEach((model) => {
        expect(model.contextWindow).toBe(200000);
        expect(model.maxOutputTokens).toBe(8192);
      });
    });
  });

  describe('healthCheck', () => {
    it('should succeed with valid API key', async () => {
      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.provider).toBe('anthropic');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('should fail gracefully with invalid API key', async () => {
      const invalidProvider = new AnthropicProvider({
        apiKey: 'invalid-key',
      });

      const result = await invalidProvider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.provider).toBe('anthropic');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('authentication_error');
    });

    it('should fail when API key is not configured', async () => {
      // Clear the env var if it exists
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      // Create provider without API key after clearing env
      const noKeyProvider = new AnthropicProvider({});

      const result = await noKeyProvider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.provider).toBe('anthropic');
      expect(result.error).toContain('ANTHROPIC_API_KEY not configured');

      // Restore env var
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    });

    it('should measure latency of health check', async () => {
      const result = await provider.healthCheck();

      expect(result.latencyMs).toBeDefined();
      // Latency may be 0 for very fast mocked responses
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('configuration', () => {
    it('should use ANTHROPIC_API_KEY from environment if not provided', () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'env-api-key';

      const envProvider = new AnthropicProvider();
      const config = envProvider.getConfig();

      expect(config.apiKey).toBe('env-api-key');

      // Restore
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('should allow updating configuration', () => {
      provider.setConfig({ temperature: 0.7, maxTokens: 2048 });
      const config = provider.getConfig();

      expect(config.temperature).toBe(0.7);
      expect(config.maxTokens).toBe(2048);
    });
  });
});
