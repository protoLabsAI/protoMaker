/**
 * MCP adapter for SharedTool conversion.
 *
 * Converts SharedTool definitions into entries compatible with
 * @modelcontextprotocol/sdk, using JSON Schema for input validation.
 */

import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';
import type { SharedTool, ToolContext, ToolResult } from '../types.js';

/**
 * MCP tool entry compatible with @modelcontextprotocol/sdk
 */
export interface MCPToolEntry {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  outputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult<unknown>>;
}

/**
 * Convert a Zod schema to a JSON Schema object compatible with MCP SDK.
 * Supports both native Zod v4 `toJSONSchema()` and the `zod-to-json-schema` library fallback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodToMCPJsonSchema(zodSchema: any): {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
} {
  // Use native Zod v4 toJSONSchema() if available
  const hasToJSONSchema =
    typeof zodSchema === 'object' &&
    zodSchema !== null &&
    'toJSONSchema' in zodSchema &&
    typeof zodSchema.toJSONSchema === 'function';

  let jsonSchema: Record<string, unknown>;

  if (hasToJSONSchema) {
    jsonSchema = (zodSchema as { toJSONSchema(): Record<string, unknown> }).toJSONSchema();
  } else {
    jsonSchema = zodToJsonSchemaLib(zodSchema, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as Record<string, unknown>;
  }

  // Remove $schema metadata — MCP doesn't need it
  const { $schema: _$schema, ...schemaWithoutMeta } = jsonSchema;

  let actualSchema = schemaWithoutMeta;

  // Add type:object if properties exist but type is missing
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
 * Convert a SharedTool to an MCP-compatible tool entry.
 *
 * The resulting entry exposes JSON Schema for input/output so MCP clients
 * can validate and display tool capabilities without Zod as a runtime dependency.
 *
 * @example
 * ```typescript
 * import { Server } from '@modelcontextprotocol/sdk/server/index.js';
 * import { toMCPTool } from './adapters/mcp-adapter.js';
 * import { getWeatherTool } from './examples/index.js';
 *
 * const server = new Server({ name: 'my-agent', version: '1.0.0' }, { capabilities: { tools: {} } });
 * const mcpTool = toMCPTool(getWeatherTool);
 *
 * server.setRequestHandler(ListToolsRequestSchema, async () => ({
 *   tools: [{ name: mcpTool.name, description: mcpTool.description, inputSchema: mcpTool.inputSchema }],
 * }));
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
    handler: async (input: Record<string, unknown>, context: ToolContext) => {
      return tool.execute(input as TInput, context);
    },
  };
}

/**
 * Convert multiple SharedTools to MCP-compatible tool entries.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toMCPTools(tools: SharedTool<any, any>[]): MCPToolEntry[] {
  return tools.map((tool) => toMCPTool(tool));
}
