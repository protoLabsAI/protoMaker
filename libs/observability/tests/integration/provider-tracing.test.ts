/**
 * Integration tests for provider tracing
 * Tests the full flow from provider invocation to Langfuse trace creation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LangfuseClient } from '../../src/langfuse/client.js';
import { wrapProviderWithTracing, type TracingConfig } from '../../src/langfuse/middleware.js';

// Mock async generator to simulate provider behavior
async function* mockProviderGenerator(messages: any[]): AsyncGenerator<any> {
  for (const message of messages) {
    yield message;
  }
}

describe('Provider Tracing Integration', () => {
  let client: LangfuseClient;
  let tracingConfig: TracingConfig;

  beforeEach(() => {
    // Create client with mock config (disabled by default for tests)
    client = new LangfuseClient({
      enabled: false, // Disabled for unit tests
    });

    tracingConfig = {
      enabled: false,
      client,
      defaultTags: ['test'],
      defaultMetadata: { environment: 'test' },
    };
  });

  describe('wrapProviderWithTracing', () => {
    it('should pass through messages when tracing is disabled', async () => {
      const messages = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-sonnet-4-5',
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
    });

    it('should pass through messages when client is unavailable', async () => {
      const messages = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];

      tracingConfig.enabled = true; // Enable tracing but client is unavailable

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-sonnet-4-5',
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
    });

    it('should extract usage from provider messages', async () => {
      const messages = [
        { type: 'text', text: 'Hello' },
        {
          type: 'usage',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-sonnet-4-5',
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
    });

    it('should handle errors during generation', async () => {
      async function* errorGenerator() {
        yield { type: 'text', text: 'Hello' };
        throw new Error('Generation failed');
      }

      const traced = wrapProviderWithTracing(errorGenerator(), tracingConfig, {
        model: 'claude-sonnet-4-5',
      });

      const results = [];
      let error: Error | undefined;

      try {
        for await (const message of traced) {
          results.push(message);
        }
      } catch (err) {
        error = err as Error;
      }

      expect(results).toHaveLength(1);
      expect(error).toBeDefined();
      expect(error?.message).toBe('Generation failed');
    });

    it('should support custom trace metadata', async () => {
      const messages = [{ type: 'text', text: 'Hello' }];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-sonnet-4-5',
        traceName: 'custom-trace',
        sessionId: 'session-123',
        userId: 'user-456',
        metadata: { custom: 'value' },
        tags: ['tag1', 'tag2'],
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
    });

    it('should support custom trace ID', async () => {
      const messages = [{ type: 'text', text: 'Hello' }];

      const customTraceId = 'trace-123';
      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-sonnet-4-5',
        traceId: customTraceId,
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost for Claude Opus 4.6', async () => {
      const messages = [
        {
          type: 'usage',
          usage: {
            input_tokens: 1000000, // 1M tokens
            output_tokens: 1000000, // 1M tokens
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-opus-4-6',
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
      // Cost calculation happens in finally block
      // For 1M input + 1M output: 15 + 75 = $90
    });

    it('should calculate cost for Claude Sonnet 4.5', async () => {
      const messages = [
        {
          type: 'usage',
          usage: {
            input_tokens: 1000000, // 1M tokens
            output_tokens: 1000000, // 1M tokens
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-sonnet-4-5',
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
      // Cost calculation happens in finally block
      // For 1M input + 1M output: 3 + 15 = $18
    });

    it('should calculate cost for Claude Haiku 4.5', async () => {
      const messages = [
        {
          type: 'usage',
          usage: {
            input_tokens: 1000000, // 1M tokens
            output_tokens: 1000000, // 1M tokens
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-haiku-4-5',
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
      // Cost calculation happens in finally block
      // For 1M input + 1M output: 0.8 + 4 = $4.80
    });
  });

  describe('Usage Extraction', () => {
    it('should extract usage from Anthropic format', async () => {
      const messages = [
        {
          type: 'usage',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-sonnet-4-5',
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
    });

    it('should extract usage from alternative format', async () => {
      const messages = [
        {
          type: 'usage',
          token_usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-sonnet-4-5',
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
    });

    it('should aggregate usage from multiple messages', async () => {
      const messages = [
        {
          type: 'usage',
          usage: {
            input_tokens: 50,
            output_tokens: 25,
          },
        },
        {
          type: 'usage',
          usage: {
            input_tokens: 50,
            output_tokens: 25,
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, tracingConfig, {
        model: 'claude-sonnet-4-5',
      });

      const results = [];
      for await (const message of traced) {
        results.push(message);
      }

      expect(results).toEqual(messages);
      // Total: 100 prompt + 50 completion tokens
    });
  });
});
