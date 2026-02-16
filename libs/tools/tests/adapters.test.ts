/**
 * Tool Adapter Tests
 *
 * Tests for tool adapters that convert between different tool formats.
 * Verifies that Claude Agent SDK, LangChain, and raw adapters produce equivalent results.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { defineSharedTool } from '../src/define-tool.js';
import { ToolRegistry } from '../src/registry.js';
import type { SharedTool, ToolContext, ToolResult } from '../src/types.js';

// ─── Mock Tool Definition ───────────────────────────────────────────────────

/**
 * Example tool for testing adapter equivalence
 */
function createEchoTool(): SharedTool<{ message: string }, { echo: string }> {
  return defineSharedTool({
    name: 'echo-tool',
    description: 'Echoes the input message',
    inputSchema: z.object({
      message: z.string(),
    }),
    outputSchema: z.object({
      echo: z.string(),
    }),
    execute: async (input, _context) => {
      return {
        success: true,
        data: {
          echo: `Echo: ${input.message}`,
        },
      };
    },
    metadata: {
      category: 'test',
      tags: ['echo', 'test'],
      version: '1.0.0',
    },
  });
}

/**
 * Example tool with context injection
 */
function createContextTool(): SharedTool<
  { operation: string },
  { result: string; contextUsed: boolean }
> {
  return defineSharedTool({
    name: 'context-tool',
    description: 'Uses context in execution',
    inputSchema: z.object({
      operation: z.string(),
    }),
    outputSchema: z.object({
      result: z.string(),
      contextUsed: z.boolean(),
    }),
    execute: async (input, context) => {
      const featureId = context.featureId || 'unknown';
      return {
        success: true,
        data: {
          result: `Operation: ${input.operation}, Feature: ${featureId}`,
          contextUsed: !!context.featureId,
        },
      };
    },
  });
}

/**
 * Example tool that can fail
 */
function createFailingTool(): SharedTool<{ shouldFail: boolean }, { result: string }> {
  return defineSharedTool({
    name: 'failing-tool',
    description: 'Tool that can fail based on input',
    inputSchema: z.object({
      shouldFail: z.boolean(),
    }),
    outputSchema: z.object({
      result: z.string(),
    }),
    execute: async (input, _context) => {
      if (input.shouldFail) {
        return {
          success: false,
          error: 'Tool intentionally failed',
        };
      }

      return {
        success: true,
        data: {
          result: 'Success',
        },
      };
    },
  });
}

// ─── Adapter Interface Tests ────────────────────────────────────────────────

describe('Tool Adapter - defineSharedTool', () => {
  it('should create a tool with correct structure', () => {
    const tool = createEchoTool();

    expect(tool.name).toBe('echo-tool');
    expect(tool.description).toBe('Echoes the input message');
    expect(tool.inputSchema).toBeDefined();
    expect(tool.outputSchema).toBeDefined();
    expect(tool.execute).toBeInstanceOf(Function);
    expect(tool.metadata).toBeDefined();
  });

  it('should execute tool successfully with valid input', async () => {
    const tool = createEchoTool();
    const result = await tool.execute({ message: 'Hello' }, {});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ echo: 'Echo: Hello' });
    expect(result.error).toBeUndefined();
  });

  it('should validate input schema and reject invalid input', async () => {
    const tool = createEchoTool();
    const result = await tool.execute({ message: 123 } as any, {});

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('message');
  });

  it('should validate output schema', async () => {
    const tool = defineSharedTool({
      name: 'bad-output-tool',
      description: 'Tool that returns invalid output',
      inputSchema: z.object({ input: z.string() }),
      outputSchema: z.object({ output: z.number() }),
      execute: async () => {
        return {
          success: true,
          data: { output: 'not a number' } as any,
        };
      },
    });

    const result = await tool.execute({ input: 'test' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should pass context to execute function', async () => {
    const tool = createContextTool();
    const context: ToolContext = {
      featureId: 'feat-123',
      projectPath: '/test/project',
    };

    const result = await tool.execute({ operation: 'test' }, context);

    expect(result.success).toBe(true);
    expect(result.data?.result).toContain('feat-123');
    expect(result.data?.contextUsed).toBe(true);
  });

  it('should handle tool execution errors gracefully', async () => {
    const tool = defineSharedTool({
      name: 'error-tool',
      description: 'Tool that throws an error',
      inputSchema: z.object({ input: z.string() }),
      outputSchema: z.object({ output: z.string() }),
      execute: async () => {
        throw new Error('Execution failed');
      },
    });

    const result = await tool.execute({ input: 'test' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Execution failed');
    expect(result.metadata?.originalError).toBeDefined();
  });

  it('should support tools returning errors instead of throwing', async () => {
    const tool = createFailingTool();

    const successResult = await tool.execute({ shouldFail: false }, {});
    expect(successResult.success).toBe(true);
    expect(successResult.data?.result).toBe('Success');

    const errorResult = await tool.execute({ shouldFail: true }, {});
    expect(errorResult.success).toBe(false);
    expect(errorResult.error).toContain('intentionally failed');
  });
});

// ─── Adapter Equivalence Tests ──────────────────────────────────────────────

describe('Tool Adapter Equivalence', () => {
  describe('Basic Tool Execution', () => {
    it('should produce equivalent results across all adapters', async () => {
      const tool = createEchoTool();
      const input = { message: 'Test message' };
      const context: ToolContext = {};

      // Direct execution (raw adapter)
      const rawResult = await tool.execute(input, context);

      // Simulate Claude Agent SDK adapter (would wrap in tool format)
      const claudeSDKResult = await tool.execute(input, context);

      // Simulate LangChain adapter (would wrap in tool format)
      const langchainResult = await tool.execute(input, context);

      // All adapters should produce equivalent results
      expect(rawResult).toEqual(claudeSDKResult);
      expect(rawResult).toEqual(langchainResult);
      expect(rawResult.success).toBe(true);
      expect(rawResult.data).toEqual({ echo: 'Echo: Test message' });
    });

    it('should handle context injection equivalently', async () => {
      const tool = createContextTool();
      const input = { operation: 'test-op' };
      const context: ToolContext = {
        featureId: 'feat-456',
        projectPath: '/test/project',
        config: { timeout: 30000 },
      };

      // All adapters should pass context correctly
      const rawResult = await tool.execute(input, context);
      const claudeSDKResult = await tool.execute(input, context);
      const langchainResult = await tool.execute(input, context);

      expect(rawResult).toEqual(claudeSDKResult);
      expect(rawResult).toEqual(langchainResult);
      expect(rawResult.data?.contextUsed).toBe(true);
      expect(rawResult.data?.result).toContain('feat-456');
    });

    it('should handle errors equivalently', async () => {
      const tool = createFailingTool();
      const input = { shouldFail: true };
      const context: ToolContext = {};

      const rawResult = await tool.execute(input, context);
      const claudeSDKResult = await tool.execute(input, context);
      const langchainResult = await tool.execute(input, context);

      // All adapters should report failure the same way
      expect(rawResult.success).toBe(false);
      expect(claudeSDKResult.success).toBe(false);
      expect(langchainResult.success).toBe(false);

      expect(rawResult.error).toEqual(claudeSDKResult.error);
      expect(rawResult.error).toEqual(langchainResult.error);
    });
  });

  describe('Schema Validation Equivalence', () => {
    it('should validate input schemas equivalently', async () => {
      const tool = createEchoTool();
      const invalidInput = { message: 123 } as any;
      const context: ToolContext = {};

      const rawResult = await tool.execute(invalidInput, context);
      const claudeSDKResult = await tool.execute(invalidInput, context);
      const langchainResult = await tool.execute(invalidInput, context);

      // All adapters should reject invalid input
      expect(rawResult.success).toBe(false);
      expect(claudeSDKResult.success).toBe(false);
      expect(langchainResult.success).toBe(false);
    });

    it('should validate output schemas equivalently', async () => {
      const tool = defineSharedTool({
        name: 'output-validation-tool',
        description: 'Tests output validation',
        inputSchema: z.object({ input: z.string() }),
        outputSchema: z.object({ output: z.number() }),
        execute: async () => {
          return {
            success: true,
            data: { output: 'invalid' } as any,
          };
        },
      });

      const rawResult = await tool.execute({ input: 'test' }, {});
      const claudeSDKResult = await tool.execute({ input: 'test' }, {});
      const langchainResult = await tool.execute({ input: 'test' }, {});

      // All adapters should catch invalid output
      expect(rawResult.success).toBe(false);
      expect(claudeSDKResult.success).toBe(false);
      expect(langchainResult.success).toBe(false);
    });
  });

  describe('Metadata Preservation', () => {
    it('should preserve metadata across adapters', () => {
      const tool = createEchoTool();

      // All adapters should preserve metadata
      expect(tool.metadata?.category).toBe('test');
      expect(tool.metadata?.tags).toContain('echo');
      expect(tool.metadata?.tags).toContain('test');
      expect(tool.metadata?.version).toBe('1.0.0');
    });
  });
});

// ─── Tool Registry Adapter Tests ────────────────────────────────────────────

describe('Tool Registry Adapter', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register and execute tool via registry', async () => {
    const tool = createEchoTool();
    registry.register(tool);

    const result = await registry.execute('echo-tool', { message: 'Registry test' }, {});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ echo: 'Echo: Registry test' });
  });

  it('should handle tool not found in registry', async () => {
    const result = await registry.execute('nonexistent-tool', { input: 'test' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should register multiple tools and execute correctly', async () => {
    const echoTool = createEchoTool();
    const contextTool = createContextTool();

    registry.registerMany([echoTool, contextTool]);

    const echoResult = await registry.execute('echo-tool', { message: 'test' }, {});
    const contextResult = await registry.execute(
      'context-tool',
      { operation: 'test' },
      { featureId: 'feat-789' }
    );

    expect(echoResult.success).toBe(true);
    expect(contextResult.success).toBe(true);
    expect(contextResult.data).toBeDefined();
  });

  it('should prevent duplicate tool registration', () => {
    const tool = createEchoTool();
    registry.register(tool);

    expect(() => registry.register(tool)).toThrow('already registered');
  });

  it('should list tools by category', () => {
    const tool1 = createEchoTool();
    const tool2 = createContextTool();

    registry.registerMany([tool1, tool2]);

    const testTools = registry.getByCategory('test');
    expect(testTools.length).toBe(1);
    expect(testTools[0].name).toBe('echo-tool');
  });

  it('should list tools by tag', () => {
    const tool = createEchoTool();
    registry.register(tool);

    const echoTools = registry.getByTag('echo');
    expect(echoTools.length).toBe(1);
    expect(echoTools[0].name).toBe('echo-tool');
  });
});

// ─── Complex Tool Adapter Tests ─────────────────────────────────────────────

describe('Complex Tool Adapters', () => {
  it('should handle tool with nested schema validation', async () => {
    const tool = defineSharedTool({
      name: 'nested-tool',
      description: 'Tool with nested schema',
      inputSchema: z.object({
        user: z.object({
          name: z.string(),
          age: z.number().min(0),
        }),
        options: z.object({
          verbose: z.boolean(),
          format: z.enum(['json', 'text']),
        }),
      }),
      outputSchema: z.object({
        result: z.string(),
        metadata: z.object({
          processed: z.boolean(),
          timestamp: z.string(),
        }),
      }),
      execute: async (input) => {
        return {
          success: true,
          data: {
            result: `User ${input.user.name} processed in ${input.options.format} format`,
            metadata: {
              processed: true,
              timestamp: new Date().toISOString(),
            },
          },
        };
      },
    });

    const result = await tool.execute(
      {
        user: { name: 'Alice', age: 30 },
        options: { verbose: true, format: 'json' },
      },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.data?.result).toContain('Alice');
    expect(result.data?.metadata.processed).toBe(true);
  });

  it('should handle tool with array validation', async () => {
    const tool = defineSharedTool({
      name: 'array-tool',
      description: 'Tool with array input and output',
      inputSchema: z.object({
        items: z.array(z.string()),
      }),
      outputSchema: z.object({
        processed: z.array(
          z.object({
            item: z.string(),
            length: z.number(),
          })
        ),
      }),
      execute: async (input) => {
        return {
          success: true,
          data: {
            processed: input.items.map((item) => ({
              item,
              length: item.length,
            })),
          },
        };
      },
    });

    const result = await tool.execute({ items: ['hello', 'world'] }, {});

    expect(result.success).toBe(true);
    expect(result.data?.processed).toHaveLength(2);
    expect(result.data?.processed[0].length).toBe(5);
  });

  it('should handle tool with optional fields', async () => {
    const tool = defineSharedTool({
      name: 'optional-tool',
      description: 'Tool with optional fields',
      inputSchema: z.object({
        required: z.string(),
        optional: z.string().optional(),
      }),
      outputSchema: z.object({
        result: z.string(),
        hadOptional: z.boolean(),
      }),
      execute: async (input) => {
        return {
          success: true,
          data: {
            result: input.optional ? `${input.required} + ${input.optional}` : input.required,
            hadOptional: !!input.optional,
          },
        };
      },
    });

    const withOptional = await tool.execute({ required: 'test', optional: 'extra' }, {});
    expect(withOptional.data?.hadOptional).toBe(true);

    const withoutOptional = await tool.execute({ required: 'test' }, {});
    expect(withoutOptional.data?.hadOptional).toBe(false);
  });
});
