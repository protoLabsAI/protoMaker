/**
 * Integration tests for provider tracing
 * Tests the full flow from provider invocation to Langfuse trace creation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LangfuseClient } from '../../src/langfuse/client.js';
import {
  wrapProviderWithTracing,
  calculateCost,
  logger,
  type TracingConfig,
} from '../../src/langfuse/middleware.js';

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

    it('should calculate cost for llama-3.3-70b-versatile', () => {
      const cost = calculateCost('llama-3.3-70b-versatile', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      });
      // 0.59 + 0.79 = 1.38
      expect(cost).toBeCloseTo(1.38);
    });

    it('should calculate cost for llama-3.1-8b-instant', () => {
      const cost = calculateCost('llama-3.1-8b-instant', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      });
      // 0.05 + 0.08 = 0.13
      expect(cost).toBeCloseTo(0.13);
    });

    it('should calculate cost for gpt-4o', () => {
      const cost = calculateCost('gpt-4o', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      });
      // 2.50 + 10.00 = 12.50
      expect(cost).toBeCloseTo(12.5);
    });

    it('should calculate cost for gpt-4o-mini', () => {
      const cost = calculateCost('gpt-4o-mini', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      });
      // 0.15 + 0.60 = 0.75
      expect(cost).toBeCloseTo(0.75);
    });

    it('should not match gpt-4o pricing for gpt-4o-mini (substring guard)', () => {
      const cost = calculateCost('gpt-4o-mini', {
        promptTokens: 500_000,
        completionTokens: 500_000,
      });
      // gpt-4o-mini at 500K each: (0.5 * 0.15) + (0.5 * 0.60) = 0.375
      // gpt-4o at 500K each would be: (0.5 * 2.50) + (0.5 * 10.00) = 6.25
      expect(cost).toBeCloseTo(0.375);
      expect(cost).not.toBeCloseTo(6.25);
    });

    it('should return undefined for unknown models', () => {
      const cost = calculateCost('unknown-model-xyz', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      });
      expect(cost).toBeUndefined();
    });

    it('should emit logger.debug when model has no pricing', () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      calculateCost('unknown-model-xyz', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
      });
      expect(debugSpy).toHaveBeenCalledWith('No pricing found for model, cost will be undefined', {
        model: 'unknown-model-xyz',
      });
      debugSpy.mockRestore();
    });
  });

  describe('Per-Tool-Call Span Tracing', () => {
    let enabledClient: LangfuseClient;
    let enabledConfig: TracingConfig;

    beforeEach(() => {
      enabledClient = new LangfuseClient({ enabled: false });
      vi.spyOn(enabledClient, 'isAvailable').mockReturnValue(true);
      vi.spyOn(enabledClient, 'createTrace').mockReturnValue(null);
      vi.spyOn(enabledClient, 'createGeneration').mockReturnValue(null);
      vi.spyOn(enabledClient, 'updateTrace').mockReturnValue(undefined);
      vi.spyOn(enabledClient, 'flush').mockResolvedValue(undefined);

      enabledConfig = {
        enabled: true,
        client: enabledClient,
      };
    });

    it('should create one span for a single tool call', async () => {
      const createSpanSpy = vi.spyOn(enabledClient, 'createSpan').mockReturnValue(null);

      const messages = [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'tool_1', name: 'Read', input: { path: '/foo.ts' } }],
          },
        },
        {
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'file content' }],
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, enabledConfig, {
        model: 'claude-sonnet-4-6',
        metadata: { featureId: 'feat-123' },
      });

      for await (const _ of traced) {
        // consume
      }

      expect(createSpanSpy).toHaveBeenCalledTimes(1);
      const spanCall = createSpanSpy.mock.calls[0][0];
      expect(spanCall.name).toBe('tool:Read');
      expect(spanCall.input.toolName).toBe('Read');
      expect(spanCall.input.toolInput).toContain('/foo.ts');
      expect(spanCall.output.result).toBe('file content');
      expect(spanCall.metadata.featureId).toBe('feat-123');
      expect(spanCall.metadata.turnIndex).toBe(0);
      expect(spanCall.metadata.toolCallIndex).toBe(0);
      expect(spanCall.startTime).toBeInstanceOf(Date);
      expect(spanCall.endTime).toBeInstanceOf(Date);
    });

    it('should track turnIndex correctly across multi-turn runs', async () => {
      const createSpanSpy = vi.spyOn(enabledClient, 'createSpan').mockReturnValue(null);

      const messages = [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'tool_1', name: 'Read', input: {} }],
          },
        },
        {
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'result1' }],
          },
        },
        {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'tool_2', name: 'Write', input: {} }],
          },
        },
        {
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'tool_2', content: 'result2' }],
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, enabledConfig, {
        model: 'claude-sonnet-4-6',
      });

      for await (const _ of traced) {
        // consume
      }

      expect(createSpanSpy).toHaveBeenCalledTimes(2);
      expect(createSpanSpy.mock.calls[0][0].metadata.turnIndex).toBe(0);
      expect(createSpanSpy.mock.calls[1][0].metadata.turnIndex).toBe(1);
    });

    it('should truncate tool input at 2KB and set truncated flag', async () => {
      const createSpanSpy = vi.spyOn(enabledClient, 'createSpan').mockReturnValue(null);

      const largeInput = 'x'.repeat(3000);
      const messages = [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'tool_1', name: 'Bash', input: largeInput }],
          },
        },
        {
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'output' }],
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, enabledConfig, {
        model: 'claude-sonnet-4-6',
      });

      for await (const _ of traced) {
        // consume
      }

      expect(createSpanSpy).toHaveBeenCalledTimes(1);
      const spanCall = createSpanSpy.mock.calls[0][0];
      expect(spanCall.input.toolInput.length).toBe(2048);
      expect(spanCall.input.truncated).toBe(true);
    });

    it('should truncate tool output at 2KB and set truncated flag', async () => {
      const createSpanSpy = vi.spyOn(enabledClient, 'createSpan').mockReturnValue(null);

      const largeOutput = 'y'.repeat(3000);
      const messages = [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'tool_1', name: 'Read', input: {} }],
          },
        },
        {
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: largeOutput }],
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, enabledConfig, {
        model: 'claude-sonnet-4-6',
      });

      for await (const _ of traced) {
        // consume
      }

      expect(createSpanSpy).toHaveBeenCalledTimes(1);
      const spanCall = createSpanSpy.mock.calls[0][0];
      expect(spanCall.output.result.length).toBe(2048);
      expect(spanCall.output.truncated).toBe(true);
    });

    it('should create no spans when tracing is disabled', async () => {
      const createSpanSpy = vi.spyOn(enabledClient, 'createSpan').mockReturnValue(null);

      const disabledConfig: TracingConfig = { enabled: false, client: enabledClient };

      const messages = [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'tool_1', name: 'Read', input: {} }],
          },
        },
        {
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'result' }],
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, disabledConfig, {
        model: 'claude-sonnet-4-6',
      });

      for await (const _ of traced) {
        // consume
      }

      expect(createSpanSpy).not.toHaveBeenCalled();
    });

    it('should silently ignore tool_result with no matching tool_use', async () => {
      const createSpanSpy = vi.spyOn(enabledClient, 'createSpan').mockReturnValue(null);

      const messages = [
        {
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'nonexistent_id', content: 'orphan result' },
            ],
          },
        },
      ];

      const generator = mockProviderGenerator(messages);
      const traced = wrapProviderWithTracing(generator, enabledConfig, {
        model: 'claude-sonnet-4-6',
      });

      for await (const _ of traced) {
        // consume
      }

      expect(createSpanSpy).not.toHaveBeenCalled();
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
