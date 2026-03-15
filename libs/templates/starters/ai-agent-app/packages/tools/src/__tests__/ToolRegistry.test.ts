import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../registry.js';
import { defineSharedTool } from '../define-tool.js';

// Factory: create a simple echo tool
const makeTool = (name: string, category?: string) =>
  defineSharedTool({
    name,
    description: `Tool ${name}`,
    inputSchema: z.object({ input: z.string() }),
    outputSchema: z.object({ output: z.string() }),
    execute: async (input) => ({ success: true, data: { output: input.input } }),
    metadata: category ? { category } : undefined,
  });

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  // --- Registration ---

  it('registers a single tool', () => {
    registry.register(makeTool('alpha'));
    expect(registry.has('alpha')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('throws on duplicate tool name', () => {
    registry.register(makeTool('dup'));
    expect(() => registry.register(makeTool('dup'))).toThrowError('already registered');
  });

  it('registers many tools at once', () => {
    registry.registerMany([makeTool('a'), makeTool('b'), makeTool('c')]);
    expect(registry.size).toBe(3);
    expect(registry.has('a')).toBe(true);
    expect(registry.has('b')).toBe(true);
    expect(registry.has('c')).toBe(true);
  });

  // --- Retrieval ---

  it('retrieves a registered tool by name', () => {
    const tool = makeTool('find-me');
    registry.register(tool);
    expect(registry.get('find-me')).toBe(tool);
  });

  it('returns undefined for unknown tool name', () => {
    expect(registry.get('ghost')).toBeUndefined();
  });

  it('returns false for has() on unknown tool', () => {
    expect(registry.has('ghost')).toBe(false);
  });

  // --- Removal ---

  it('unregisters a tool and returns true', () => {
    registry.register(makeTool('removable'));
    expect(registry.unregister('removable')).toBe(true);
    expect(registry.has('removable')).toBe(false);
  });

  it('returns false when unregistering an unknown tool', () => {
    expect(registry.unregister('ghost')).toBe(false);
  });

  // --- Listing ---

  it('lists all registered tool names', () => {
    registry.registerMany([makeTool('x'), makeTool('y'), makeTool('z')]);
    const names = registry.listNames();
    expect(names).toContain('x');
    expect(names).toContain('y');
    expect(names).toContain('z');
  });

  it('lists all registered tool instances', () => {
    const tools = [makeTool('p'), makeTool('q')];
    registry.registerMany(tools);
    expect(registry.listTools()).toHaveLength(2);
  });

  // --- Category filtering ---

  it('filters tools by category', () => {
    registry.register(makeTool('cat1', 'weather'));
    registry.register(makeTool('cat2', 'weather'));
    registry.register(makeTool('cat3', 'search'));

    const weatherTools = registry.getByCategory('weather');
    expect(weatherTools).toHaveLength(2);
    expect(weatherTools.every((t) => t.metadata?.category === 'weather')).toBe(true);
  });

  it('returns empty array for unknown category', () => {
    registry.register(makeTool('t1', 'search'));
    expect(registry.getByCategory('nonexistent')).toHaveLength(0);
  });

  // --- Execution ---

  it('executes a tool by name and returns result', async () => {
    registry.register(makeTool('exec'));
    const result = await registry.execute('exec', { input: 'hello' }, {});
    expect(result.success).toBe(true);
    expect((result.data as { output: string }).output).toBe('hello');
  });

  it('returns error result for unknown tool name', async () => {
    const result = await registry.execute('ghost', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('handles tool execution errors via error boundary', async () => {
    const errorTool = defineSharedTool({
      name: 'boom',
      description: 'Always throws',
      inputSchema: z.object({ x: z.string() }),
      outputSchema: z.object({ y: z.string() }),
      execute: async () => {
        throw new Error('Boom!');
      },
    });

    registry.register(errorTool);
    const result = await registry.execute('boom', { x: 'test' }, {});
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // --- Reset ---

  it('clears all tools', () => {
    registry.registerMany([makeTool('p'), makeTool('q'), makeTool('r')]);
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.listNames()).toHaveLength(0);
  });
});
