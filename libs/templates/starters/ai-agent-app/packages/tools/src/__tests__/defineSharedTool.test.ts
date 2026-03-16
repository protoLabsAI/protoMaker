import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineSharedTool } from '../define-tool.js';

// Helper: build a simple echo tool for reuse across tests
const makeTool = (name = 'echo') =>
  defineSharedTool({
    name,
    description: 'Echo the input message',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.object({ echo: z.string() }),
    execute: async (input) => ({ success: true, data: { echo: input.message } }),
  });

describe('defineSharedTool', () => {
  it('creates a tool with the correct name and description', () => {
    const tool = makeTool('my-tool');
    expect(tool.name).toBe('my-tool');
    expect(tool.description).toBe('Echo the input message');
  });

  it('exposes the input and output schemas', () => {
    const tool = makeTool();
    expect(tool.inputSchema).toBeDefined();
    expect(tool.outputSchema).toBeDefined();
  });

  it('executes successfully with valid input', async () => {
    const tool = makeTool();
    const result = await tool.execute({ message: 'hello' }, {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ echo: 'hello' });
  });

  it('returns failure result when input validation fails', async () => {
    const tool = defineSharedTool({
      name: 'strict',
      description: 'Strict positive integer tool',
      inputSchema: z.object({ count: z.number().int().positive() }),
      outputSchema: z.object({ doubled: z.number() }),
      execute: async (input) => ({ success: true, data: { doubled: input.count * 2 } }),
    });

    const result = await tool.execute({ count: -1 } as never, {});
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns failure result when execution throws', async () => {
    const tool = defineSharedTool({
      name: 'failing',
      description: 'Always fails',
      inputSchema: z.object({ x: z.string() }),
      outputSchema: z.object({ y: z.string() }),
      execute: async () => {
        throw new Error('Intentional error');
      },
    });

    const result = await tool.execute({ x: 'test' }, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Intentional error');
  });

  it('validates output schema after successful execution', async () => {
    const tool = defineSharedTool({
      name: 'output-test',
      description: 'Returns validated output',
      inputSchema: z.object({ n: z.number() }),
      outputSchema: z.object({ squared: z.number() }),
      execute: async (input) => ({ success: true, data: { squared: input.n ** 2 } }),
    });

    const result = await tool.execute({ n: 4 }, {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ squared: 16 });
  });

  it('passes metadata through', () => {
    const tool = defineSharedTool({
      name: 'meta',
      description: 'Tool with metadata',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      execute: async (input) => ({ success: true, data: { y: input.x } }),
      metadata: { category: 'math', tags: ['example', 'demo'], version: '2.0.0' },
    });

    expect(tool.metadata?.category).toBe('math');
    expect(tool.metadata?.tags).toContain('example');
    expect(tool.metadata?.version).toBe('2.0.0');
  });

  it('passes context through to the execute function', async () => {
    let capturedContext = {};

    const tool = defineSharedTool({
      name: 'context-test',
      description: 'Captures context',
      inputSchema: z.object({ v: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async (_input, ctx) => {
        capturedContext = ctx;
        return { success: true, data: { ok: true } };
      },
    });

    const context = { config: { key: 'value' }, userId: 'u1' };
    await tool.execute({ v: 'test' }, context);
    expect(capturedContext).toEqual(context);
  });
});
