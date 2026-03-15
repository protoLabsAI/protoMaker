import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineSharedTool } from '../define-tool.js';
import { toMCPTool, toMCPTools } from '../adapters/mcp-adapter.js';
import { toExpressRouter } from '../adapters/express-adapter.js';

// Shared sample tool for all adapter tests
const sampleTool = defineSharedTool({
  name: 'sample',
  description: 'A sample tool for adapter tests',
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().optional().default(5),
  }),
  outputSchema: z.object({
    result: z.string(),
    count: z.number(),
  }),
  execute: async (input) => ({
    success: true,
    data: { result: `Query: ${input.query}`, count: input.limit },
  }),
  metadata: { category: 'test', tags: ['sample'], version: '1.0.0' },
});

// ------- toMCPTool -------

describe('toMCPTool', () => {
  it('converts SharedTool to MCPToolEntry', () => {
    const entry = toMCPTool(sampleTool);
    expect(entry.name).toBe('sample');
    expect(entry.description).toBe('A sample tool for adapter tests');
    expect(typeof entry.handler).toBe('function');
  });

  it('produces a valid JSON Schema for inputSchema', () => {
    const entry = toMCPTool(sampleTool);
    expect(entry.inputSchema).toBeDefined();
    expect(entry.inputSchema.type).toBe('object');
    expect(entry.inputSchema.properties).toBeDefined();
    expect(entry.inputSchema.properties).toHaveProperty('query');
    expect(entry.inputSchema.properties).toHaveProperty('limit');
  });

  it('produces a valid JSON Schema for outputSchema', () => {
    const entry = toMCPTool(sampleTool);
    expect(entry.outputSchema).toBeDefined();
    expect(entry.outputSchema?.type).toBe('object');
    expect(entry.outputSchema?.properties).toHaveProperty('result');
    expect(entry.outputSchema?.properties).toHaveProperty('count');
  });

  it('handler executes the underlying tool', async () => {
    const entry = toMCPTool(sampleTool);
    const result = await entry.handler({ query: 'hello', limit: 3 }, {});
    expect(result.success).toBe(true);
    expect((result.data as { result: string }).result).toBe('Query: hello');
  });

  it('handler returns failure result for invalid inputs', async () => {
    const entry = toMCPTool(sampleTool);
    // Pass missing required field — the SharedTool's Zod validation catches it
    const result = await entry.handler({}, {});
    expect(result.success).toBe(false);
  });
});

describe('toMCPTools', () => {
  it('converts an array of SharedTools to MCPToolEntry array', () => {
    const entries = toMCPTools([sampleTool, sampleTool]);
    // Note: same tool twice for simplicity — in real use each must have unique name
    expect(entries).toHaveLength(2);
    entries.forEach((entry) => {
      expect(entry.name).toBe('sample');
      expect(typeof entry.handler).toBe('function');
    });
  });
});

// ------- toExpressRouter -------

describe('toExpressRouter', () => {
  it('returns an Express Router (a function)', () => {
    const router = toExpressRouter([sampleTool]);
    expect(typeof router).toBe('function');
  });

  it('router has a stack with registered routes', () => {
    const router = toExpressRouter([sampleTool]);
    const stack = (router as unknown as { stack: unknown[] }).stack;
    expect(Array.isArray(stack)).toBe(true);
    expect(stack.length).toBeGreaterThan(0);
  });

  it('registers routes for each tool', () => {
    const toolA = defineSharedTool({
      name: 'tool-a',
      description: 'Tool A',
      inputSchema: z.object({ a: z.string() }),
      outputSchema: z.object({ result: z.string() }),
      execute: async (input) => ({ success: true, data: { result: input.a } }),
    });
    const toolB = defineSharedTool({
      name: 'tool-b',
      description: 'Tool B',
      inputSchema: z.object({ b: z.number() }),
      outputSchema: z.object({ result: z.number() }),
      execute: async (input) => ({ success: true, data: { result: input.b } }),
    });

    const router = toExpressRouter([toolA, toolB]);
    const stack = (router as unknown as { stack: { route?: { path: string } }[] }).stack;
    const paths = stack.filter((l) => l.route).map((l) => l.route!.path);

    expect(paths).toContain('/tools/tool-a');
    expect(paths).toContain('/tools/tool-b');
  });

  it('respects custom basePath option', () => {
    const router = toExpressRouter([sampleTool], { basePath: '/api/v1' });
    const stack = (router as unknown as { stack: { route?: { path: string } }[] }).stack;
    const paths = stack.filter((l) => l.route).map((l) => l.route!.path);

    expect(paths.some((p) => p.includes('/api/v1/sample'))).toBe(true);
  });

  it('includes dispatcher and list routes by default', () => {
    const router = toExpressRouter([sampleTool]);
    const stack = (router as unknown as { stack: { route?: { path: string } }[] }).stack;
    const paths = stack.filter((l) => l.route).map((l) => l.route!.path);

    // Dispatcher: POST /tools/execute
    expect(paths).toContain('/tools/execute');
    // List: GET /tools
    expect(paths).toContain('/tools');
  });

  it('omits dispatcher routes when includeDispatcher is false', () => {
    const router = toExpressRouter([sampleTool], { includeDispatcher: false });
    const stack = (router as unknown as { stack: { route?: { path: string } }[] }).stack;
    const paths = stack.filter((l) => l.route).map((l) => l.route!.path);

    expect(paths).not.toContain('/tools/execute');
    expect(paths).not.toContain('/tools');
  });
});
