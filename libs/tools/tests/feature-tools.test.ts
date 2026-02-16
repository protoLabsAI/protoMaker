/**
 * Feature Tools Tests
 *
 * Integration tests for feature-specific tools and their interaction with the tool system.
 * Tests timeout handling, graceful degradation, and real-world tool scenarios.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { defineSharedTool } from '../src/define-tool.js';
import { ToolRegistry } from '../src/registry.js';
import type { ToolContext, ToolResult } from '../src/types.js';

// ─── Mock Feature Tools ─────────────────────────────────────────────────────

/**
 * Create a tool that simulates timeout behavior
 */
function createTimeoutTool(delayMs: number) {
  return defineSharedTool({
    name: 'timeout-tool',
    description: 'Tool that can timeout',
    inputSchema: z.object({
      operation: z.string(),
      timeout: z.number().optional(),
    }),
    outputSchema: z.object({
      result: z.string(),
      duration: z.number(),
    }),
    execute: async (input, _context) => {
      const startTime = Date.now();
      const timeoutMs = input.timeout || 5000;

      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const duration = Date.now() - startTime;

      if (duration > timeoutMs) {
        return {
          success: false,
          error: `Operation timed out after ${timeoutMs}ms`,
          metadata: { duration },
        };
      }

      return {
        success: true,
        data: {
          result: `Completed ${input.operation}`,
          duration,
        },
      };
    },
    metadata: {
      category: 'feature',
      tags: ['timeout', 'async'],
    },
  });
}

/**
 * Create a tool with degraded fallback behavior
 */
function createDegradedTool() {
  return defineSharedTool({
    name: 'degraded-tool',
    description: 'Tool with graceful degradation',
    inputSchema: z.object({
      query: z.string(),
      useFallback: z.boolean().default(false),
    }),
    outputSchema: z.object({
      result: z.string(),
      quality: z.enum(['full', 'degraded']),
      warnings: z.array(z.string()).optional(),
    }),
    execute: async (input, context) => {
      try {
        // Simulate primary operation that might fail
        if (input.useFallback) {
          throw new Error('Primary operation unavailable');
        }

        return {
          success: true,
          data: {
            result: `Full quality result for: ${input.query}`,
            quality: 'full' as const,
          },
        };
      } catch (error) {
        // Graceful degradation
        return {
          success: true,
          data: {
            result: `Degraded result for: ${input.query}`,
            quality: 'degraded' as const,
            warnings: ['Primary operation failed, using fallback'],
          },
          metadata: {
            degraded: true,
            originalError: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    metadata: {
      category: 'feature',
      tags: ['resilience', 'fallback'],
    },
  });
}

/**
 * Create a tool that uses feature context
 */
function createFeatureContextTool() {
  return defineSharedTool({
    name: 'feature-context-tool',
    description: 'Tool that uses feature-specific context',
    inputSchema: z.object({
      action: z.string(),
    }),
    outputSchema: z.object({
      result: z.string(),
      featureId: z.string(),
      projectPath: z.string().optional(),
    }),
    execute: async (input, context) => {
      if (!context.featureId) {
        return {
          success: false,
          error: 'Feature ID is required in context',
        };
      }

      return {
        success: true,
        data: {
          result: `Action '${input.action}' executed`,
          featureId: context.featureId,
          projectPath: context.projectPath,
        },
      };
    },
    metadata: {
      category: 'feature',
      tags: ['context', 'feature-specific'],
    },
  });
}

/**
 * Create a tool with retry logic
 */
function createRetryTool(maxRetries = 3) {
  let attemptCount = 0;

  return defineSharedTool({
    name: 'retry-tool',
    description: 'Tool with automatic retry logic',
    inputSchema: z.object({
      operation: z.string(),
      failUntilAttempt: z.number().default(0),
    }),
    outputSchema: z.object({
      result: z.string(),
      attempts: z.number(),
    }),
    execute: async (input, _context) => {
      attemptCount++;

      if (attemptCount < input.failUntilAttempt) {
        return {
          success: false,
          error: `Attempt ${attemptCount} failed`,
          metadata: { attempts: attemptCount },
        };
      }

      return {
        success: true,
        data: {
          result: `Operation succeeded after ${attemptCount} attempts`,
          attempts: attemptCount,
        },
      };
    },
    metadata: {
      category: 'feature',
      tags: ['retry', 'resilience'],
    },
  });
}

// ─── Timeout Handling Tests ─────────────────────────────────────────────────

describe('Timeout Handling', () => {
  it('should complete operation within timeout', async () => {
    const tool = createTimeoutTool(50); // 50ms delay
    const result = await tool.execute({ operation: 'fast-op', timeout: 1000 }, {});

    expect(result.success).toBe(true);
    expect(result.data?.result).toContain('Completed');
    expect(result.data?.duration).toBeLessThan(1000);
  });

  it('should handle operation timeout', async () => {
    const tool = createTimeoutTool(200); // 200ms delay
    const result = await tool.execute({ operation: 'slow-op', timeout: 100 }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
    expect(result.metadata?.duration).toBeGreaterThan(100);
  });

  it('should use default timeout when not specified', async () => {
    const tool = createTimeoutTool(50);
    const result = await tool.execute({ operation: 'default-timeout' }, {});

    expect(result.success).toBe(true);
  });
});

// ─── Graceful Degradation Tests ─────────────────────────────────────────────

describe('Graceful Degradation', () => {
  it('should return full quality result when primary succeeds', async () => {
    const tool = createDegradedTool();
    const result = await tool.execute({ query: 'test query', useFallback: false }, {});

    expect(result.success).toBe(true);
    expect(result.data?.quality).toBe('full');
    expect(result.data?.warnings).toBeUndefined();
    expect(result.metadata?.degraded).toBeUndefined();
  });

  it('should return degraded result when primary fails', async () => {
    const tool = createDegradedTool();
    const result = await tool.execute({ query: 'test query', useFallback: true }, {});

    expect(result.success).toBe(true); // Still succeeds with degraded quality
    expect(result.data?.quality).toBe('degraded');
    expect(result.data?.warnings).toBeDefined();
    expect(result.data?.warnings?.[0]).toContain('Primary operation failed');
    expect(result.metadata?.degraded).toBe(true);
  });

  it('should include original error in degraded response metadata', async () => {
    const tool = createDegradedTool();
    const result = await tool.execute({ query: 'test', useFallback: true }, {});

    expect(result.metadata?.originalError).toContain('Primary operation unavailable');
  });
});

// ─── Feature Context Tests ──────────────────────────────────────────────────

describe('Feature Context Integration', () => {
  it('should use feature context correctly', async () => {
    const tool = createFeatureContextTool();
    const context: ToolContext = {
      featureId: 'feat-123',
      projectPath: '/test/project',
    };

    const result = await tool.execute({ action: 'create-file' }, context);

    expect(result.success).toBe(true);
    expect(result.data?.featureId).toBe('feat-123');
    expect(result.data?.projectPath).toBe('/test/project');
  });

  it('should fail when required context is missing', async () => {
    const tool = createFeatureContextTool();
    const result = await tool.execute({ action: 'create-file' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Feature ID is required');
  });

  it('should pass additional context metadata', async () => {
    const tool = defineSharedTool({
      name: 'metadata-tool',
      description: 'Tool that uses context metadata',
      inputSchema: z.object({ input: z.string() }),
      outputSchema: z.object({ output: z.string() }),
      execute: async (input, context) => {
        const metadata = context.metadata as Record<string, unknown>;
        const branch = metadata?.branch as string;

        return {
          success: true,
          data: {
            output: `Processed on branch: ${branch || 'unknown'}`,
          },
        };
      },
    });

    const context: ToolContext = {
      featureId: 'feat-456',
      metadata: {
        branch: 'feature/test-branch',
        author: 'test-user',
      },
    };

    const result = await tool.execute({ input: 'test' }, context);

    expect(result.success).toBe(true);
    expect(result.data?.output).toContain('feature/test-branch');
  });
});

// ─── Retry Logic Tests ──────────────────────────────────────────────────────

describe('Retry Logic', () => {
  it('should succeed on first attempt', async () => {
    const tool = createRetryTool();
    const result = await tool.execute({ operation: 'immediate-success', failUntilAttempt: 0 }, {});

    expect(result.success).toBe(true);
    expect(result.data?.attempts).toBe(1);
  });

  it('should succeed after retries', async () => {
    const tool = createRetryTool();

    // First attempt (will fail)
    const attempt1 = await tool.execute({ operation: 'retry-op', failUntilAttempt: 3 }, {});
    expect(attempt1.success).toBe(false);

    // Second attempt (will fail)
    const attempt2 = await tool.execute({ operation: 'retry-op', failUntilAttempt: 3 }, {});
    expect(attempt2.success).toBe(false);

    // Third attempt (will succeed)
    const attempt3 = await tool.execute({ operation: 'retry-op', failUntilAttempt: 3 }, {});
    expect(attempt3.success).toBe(true);
    expect(attempt3.data?.attempts).toBe(3);
  });
});

// ─── Tool Registry Integration Tests ────────────────────────────────────────

describe('Feature Tool Registry Integration', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register multiple feature tools', () => {
    const tools = [
      createTimeoutTool(50),
      createDegradedTool(),
      createFeatureContextTool(),
      createRetryTool(),
    ];

    registry.registerMany(tools);

    expect(registry.size).toBe(4);
    expect(registry.has('timeout-tool')).toBe(true);
    expect(registry.has('degraded-tool')).toBe(true);
    expect(registry.has('feature-context-tool')).toBe(true);
    expect(registry.has('retry-tool')).toBe(true);
  });

  it('should execute timeout tool via registry', async () => {
    const tool = createTimeoutTool(50);
    registry.register(tool);

    const result = await registry.execute('timeout-tool', { operation: 'test', timeout: 1000 }, {});

    expect(result.success).toBe(true);
  });

  it('should execute degraded tool via registry', async () => {
    const tool = createDegradedTool();
    registry.register(tool);

    const result = await registry.execute(
      'degraded-tool',
      { query: 'test', useFallback: true },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.data?.quality).toBe('degraded');
  });

  it('should pass context through registry execution', async () => {
    const tool = createFeatureContextTool();
    registry.register(tool);

    const context: ToolContext = {
      featureId: 'feat-registry-test',
      projectPath: '/test/project',
    };

    const result = await registry.execute('feature-context-tool', { action: 'test' }, context);

    expect(result.success).toBe(true);
    expect(result.data?.featureId).toBe('feat-registry-test');
  });

  it('should filter tools by category', () => {
    registry.registerMany([
      createTimeoutTool(50),
      createDegradedTool(),
      createFeatureContextTool(),
    ]);

    const featureTools = registry.getByCategory('feature');
    expect(featureTools.length).toBe(3);
  });

  it('should filter tools by tag', () => {
    registry.registerMany([createTimeoutTool(50), createDegradedTool(), createRetryTool()]);

    const resilienceTools = registry.getByTag('resilience');
    expect(resilienceTools.length).toBe(2); // degraded-tool and retry-tool
  });
});

// ─── Error Handling Tests ───────────────────────────────────────────────────

describe('Error Handling in Feature Tools', () => {
  it('should handle tool execution errors with proper error result', async () => {
    const tool = defineSharedTool({
      name: 'error-tool',
      description: 'Tool that throws an error',
      inputSchema: z.object({ input: z.string() }),
      outputSchema: z.object({ output: z.string() }),
      execute: async () => {
        throw new Error('Unexpected error occurred');
      },
    });

    const result = await tool.execute({ input: 'test' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unexpected error');
    expect(result.metadata?.originalError).toBeDefined();
  });

  it('should handle validation errors separately from execution errors', async () => {
    const tool = defineSharedTool({
      name: 'validation-tool',
      description: 'Tool with strict validation',
      inputSchema: z.object({
        email: z.string().email(),
        age: z.number().min(0).max(120),
      }),
      outputSchema: z.object({ valid: z.boolean() }),
      execute: async () => {
        return { success: true, data: { valid: true } };
      },
    });

    // Invalid email
    const result1 = await tool.execute({ email: 'not-an-email', age: 30 } as any, {});
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('email');

    // Invalid age
    const result2 = await tool.execute({ email: 'test@example.com', age: 200 } as any, {});
    expect(result2.success).toBe(false);
    expect(result2.error).toBeDefined();

    // Valid input
    const result3 = await tool.execute({ email: 'test@example.com', age: 30 }, {});
    expect(result3.success).toBe(true);
  });

  it('should preserve error metadata through registry execution', async () => {
    const registry = new ToolRegistry();

    const tool = defineSharedTool({
      name: 'meta-error-tool',
      description: 'Tool with metadata in errors',
      inputSchema: z.object({ input: z.string() }),
      outputSchema: z.object({ output: z.string() }),
      execute: async () => {
        const error = new Error('Custom error');
        (error as any).code = 'ERR_CUSTOM';
        throw error;
      },
    });

    registry.register(tool);
    const result = await registry.execute('meta-error-tool', { input: 'test' }, {});

    expect(result.success).toBe(false);
    expect(result.metadata?.originalError).toBeDefined();
  });
});

// ─── Performance and Concurrency Tests ──────────────────────────────────────

describe('Tool Performance and Concurrency', () => {
  it('should handle concurrent tool executions', async () => {
    const tool = createTimeoutTool(50);

    const promises = Array.from({ length: 10 }, (_, i) =>
      tool.execute({ operation: `concurrent-op-${i}`, timeout: 1000 }, {})
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(10);
    results.forEach((result) => {
      expect(result.success).toBe(true);
    });
  });

  it('should handle mixed success and failure in concurrent executions', async () => {
    const tool = createDegradedTool();

    const promises = Array.from({ length: 6 }, (_, i) =>
      tool.execute({ query: `query-${i}`, useFallback: i % 2 === 0 }, {})
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(6);
    // All should succeed (some with full quality, some degraded)
    results.forEach((result) => {
      expect(result.success).toBe(true);
    });

    // Check that we have both qualities represented
    const fullQuality = results.filter((r) => r.data?.quality === 'full');
    const degradedQuality = results.filter((r) => r.data?.quality === 'degraded');

    expect(fullQuality.length).toBe(3);
    expect(degradedQuality.length).toBe(3);
  });
});
