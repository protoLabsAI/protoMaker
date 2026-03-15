import type { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';
import type { SharedTool, ToolContext, ToolResult } from '../core/types.js';

/**
 * MCP Tool Entry compatible with @modelcontextprotocol/sdk.
 * Uses JSON Schema (draft-07) for input/output validation.
 */
export interface MCPToolEntry {
  /** Unique identifier for the tool */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /**
   * JSON Schema for validating tool inputs.
   * Must be an object schema with properties and optional required array.
   */
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  /** Optional JSON Schema for validating tool outputs */
  outputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  /** The tool execution handler */
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult<unknown>>;
}

/**
 * Converts a Zod schema to a JSON Schema object compatible with the MCP SDK.
 *
 * Supports both Zod v4 (native `.toJSONSchema()`) and Zod v3
 * (via the `zod-to-json-schema` library).
 */
function zodToMCPJsonSchema(zodSchema: z.ZodType<unknown>): {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
} {
  // Support Zod v4 native toJSONSchema method if available
  const hasToJSONSchema =
    'toJSONSchema' in zodSchema &&
    typeof (zodSchema as unknown as { toJSONSchema?: unknown }).toJSONSchema === 'function';

  let jsonSchema: Record<string, unknown>;

  if (hasToJSONSchema) {
    jsonSchema = (
      zodSchema as unknown as { toJSONSchema: () => Record<string, unknown> }
    ).toJSONSchema();
  } else {
    // Fall back to zod-to-json-schema library (Zod v3)
    jsonSchema = zodToJsonSchemaLib(zodSchema as Parameters<typeof zodToJsonSchemaLib>[0], {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as Record<string, unknown>;
  }

  // Remove $schema metadata — MCP doesn't need it
  const { $schema: _$schema, ...schemaWithoutMeta } = jsonSchema;
  let actualSchema = schemaWithoutMeta;

  // Ensure type: 'object' is set
  if (!actualSchema['type'] && actualSchema['properties']) {
    actualSchema = { type: 'object', ...actualSchema };
  }

  if (actualSchema['type'] !== 'object') {
    throw new Error(
      `MCP tools require object schemas for input, got: ${JSON.stringify(actualSchema)}`
    );
  }

  return actualSchema as {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

/**
 * Convert a single `SharedTool` to an MCP-compatible tool entry.
 *
 * The resulting entry can be registered directly with `@modelcontextprotocol/sdk`.
 *
 * @example
 * ```typescript
 * import { defineSharedTool, toMCPTool } from '@ai-agent-app/tools';
 * import { z } from 'zod';
 *
 * const myTool = defineSharedTool({ ... });
 * const mcpEntry = toMCPTool(myTool);
 *
 * // Register with MCP server
 * server.tool(mcpEntry.name, mcpEntry.inputSchema, async (args) => {
 *   const result = await mcpEntry.handler(args, {});
 *   return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
 * });
 * ```
 */
export function toMCPTool<TInput = unknown, TOutput = unknown>(
  tool: SharedTool<TInput, TOutput>
): MCPToolEntry {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: zodToMCPJsonSchema(tool.inputSchema),
    outputSchema: zodToMCPJsonSchema(tool.outputSchema),
    handler: async (
      input: Record<string, unknown>,
      context: ToolContext
    ): Promise<ToolResult<unknown>> => {
      return tool.execute(input as TInput, context);
    },
  };
}

/**
 * Convert multiple `SharedTool` instances to MCP-compatible tool entries.
 *
 * @example
 * ```typescript
 * import { toMCPTools } from '@ai-agent-app/tools';
 *
 * const mcpEntries = toMCPTools([weatherTool, searchTool]);
 * ```
 */
export function toMCPTools(tools: SharedTool[]): MCPToolEntry[] {
  return tools.map((tool) => toMCPTool(tool));
}
