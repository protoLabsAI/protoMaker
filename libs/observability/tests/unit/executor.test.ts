import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LangfuseClient } from '../../src/langfuse/client.js';
import { executeTrackedPrompt } from '../../src/langfuse/executor.js';
import { MockLangfuseAPI, createMockLangfuseClient } from '../mocks/langfuse-api.js';

describe('executeTrackedPrompt', () => {
  let mockAPI: MockLangfuseAPI;
  let client: LangfuseClient;

  beforeEach(() => {
    mockAPI = new MockLangfuseAPI();
    // Create a disabled client for offline tests
    client = new LangfuseClient({ enabled: false });
  });

  it('should execute prompt with fallback when Langfuse is unavailable', async () => {
    const fallbackPrompt = 'Hello {{NAME}}!';
    const executor = vi.fn().mockResolvedValue('Hello World!');

    const result = await executeTrackedPrompt(client, 'greeting', {
      fallbackPrompt,
      variables: { NAME: 'World' },
      executor,
    });

    expect(result.output).toBe('Hello World!');
    expect(executor).toHaveBeenCalledWith(
      'Hello World!',
      expect.objectContaining({
        prompt: 'Hello World!',
        traceId: expect.any(String),
        generationId: expect.any(String),
      })
    );
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should inject variables correctly', async () => {
    const fallbackPrompt = 'User: {{USER_NAME}}, Task: {{TASK_NAME}}';
    const executor = vi.fn().mockResolvedValue('Done');

    await executeTrackedPrompt(client, 'task', {
      fallbackPrompt,
      variables: {
        USER_NAME: 'Alice',
        TASK_NAME: 'Deploy',
      },
      executor,
    });

    expect(executor).toHaveBeenCalledWith('User: Alice, Task: Deploy', expect.any(Object));
  });

  it('should preserve placeholders for missing variables', async () => {
    const fallbackPrompt = 'Hello {{NAME}}, your ID is {{USER_ID}}';
    const executor = vi.fn().mockResolvedValue('Done');

    await executeTrackedPrompt(client, 'partial', {
      fallbackPrompt,
      variables: { NAME: 'Bob' },
      executor,
    });

    expect(executor).toHaveBeenCalledWith('Hello Bob, your ID is {{USER_ID}}', expect.any(Object));
  });

  it('should handle executor errors gracefully', async () => {
    const fallbackPrompt = 'Test prompt';
    const executor = vi.fn().mockRejectedValue(new Error('Execution failed'));

    const result = await executeTrackedPrompt(client, 'failing', {
      fallbackPrompt,
      executor,
    });

    expect(result.output).toBe('');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('Execution failed');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should throw error if no fallback prompt provided when Langfuse unavailable', async () => {
    const executor = vi.fn().mockResolvedValue('Done');

    await expect(
      executeTrackedPrompt(client, 'no-fallback', {
        executor,
      })
    ).rejects.toThrow('No fallback prompt provided for no-fallback');
  });

  it('should throw error if no executor provided', async () => {
    await expect(
      executeTrackedPrompt(client, 'no-executor', {
        fallbackPrompt: 'Test',
      })
    ).rejects.toThrow('No executor function provided');
  });

  it('should pass execution context to executor', async () => {
    const fallbackPrompt = 'Test {{VAR}}';
    const executor = vi.fn().mockResolvedValue('Result');

    await executeTrackedPrompt(client, 'context-test', {
      fallbackPrompt,
      variables: { VAR: 'value' },
      executor,
    });

    expect(executor).toHaveBeenCalledWith(
      'Test value',
      expect.objectContaining({
        prompt: 'Test value',
        traceId: expect.any(String),
        generationId: expect.any(String),
        promptConfig: undefined, // No Langfuse prompt fetched
      })
    );
  });

  it('should generate unique trace and generation IDs', async () => {
    const fallbackPrompt = 'Test';
    const executor = vi.fn().mockResolvedValue('Done');

    const result1 = await executeTrackedPrompt(client, 'unique-1', {
      fallbackPrompt,
      executor,
    });

    const result2 = await executeTrackedPrompt(client, 'unique-2', {
      fallbackPrompt,
      executor,
    });

    expect(result1.traceId).not.toBe(result2.traceId);
    expect(result1.generationId).not.toBe(result2.generationId);
  });

  it('should use provided trace ID if given', async () => {
    const fallbackPrompt = 'Test';
    const executor = vi.fn().mockResolvedValue('Done');
    const customTraceId = 'custom-trace-123';

    const result = await executeTrackedPrompt(client, 'custom-trace', {
      fallbackPrompt,
      executor,
      traceId: customTraceId,
    });

    expect(result.traceId).toBe(customTraceId);
  });

  it('should measure execution latency', async () => {
    const fallbackPrompt = 'Test';
    const executor = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'Done';
    });

    const result = await executeTrackedPrompt(client, 'latency', {
      fallbackPrompt,
      executor,
    });

    // Allow some margin for timing variations
    expect(result.latencyMs).toBeGreaterThanOrEqual(5);
  });

  it('should handle empty variables object', async () => {
    const fallbackPrompt = 'No variables here';
    const executor = vi.fn().mockResolvedValue('Done');

    await executeTrackedPrompt(client, 'no-vars', {
      fallbackPrompt,
      variables: {},
      executor,
    });

    expect(executor).toHaveBeenCalledWith('No variables here', expect.any(Object));
  });

  it('should handle prompt with no variables', async () => {
    const fallbackPrompt = 'Static prompt';
    const executor = vi.fn().mockResolvedValue('Done');

    await executeTrackedPrompt(client, 'static', {
      fallbackPrompt,
      executor,
    });

    expect(executor).toHaveBeenCalledWith('Static prompt', expect.any(Object));
  });

  it('should pass metadata and tags through context', async () => {
    const fallbackPrompt = 'Test';
    const executor = vi.fn().mockResolvedValue('Done');

    await executeTrackedPrompt(client, 'metadata-test', {
      fallbackPrompt,
      executor,
      metadata: { custom: 'value' },
      tags: ['test', 'important'],
      userId: 'user-123',
      sessionId: 'session-456',
    });

    expect(executor).toHaveBeenCalled();
  });
});
