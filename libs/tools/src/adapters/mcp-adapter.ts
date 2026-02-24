import type { z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';
import type { SharedTool, ToolContext, ToolResult } from '../types.js';

/**
 * MCP Tool Entry compatible with @modelcontextprotocol/sdk
 * Uses JSON Schema for input validation
 */
export interface MCPToolEntry {
  /**
   * Unique identifier for the tool
   */
  name: string;

  /**
   * Human-readable description of what the tool does
   */
  description: string;

  /**
   * JSON Schema for validating tool inputs
   * Must be an object schema with properties and optional required array
   */
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };

  /**
   * Optional JSON Schema for validating tool outputs
   */
  outputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };

  /**
   * The tool execution handler
   * Takes validated input and context, returns a result
   */
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult<unknown>>;
}

/**
 * Converts a Zod schema to JSON Schema compatible with MCP SDK
 * Extracts properties and required fields from the Zod object schema
 */
function zodToMCPJsonSchema(zodSchema: z.ZodType<any, any, any>): {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
} {
  // Check if the schema has native toJSONSchema method (Zod v4+)
  const hasToJSONSchema =
    'toJSONSchema' in zodSchema && typeof zodSchema.toJSONSchema === 'function';

  let jsonSchema: Record<string, unknown>;

  if (hasToJSONSchema) {
    // Use native Zod v4 method
    jsonSchema = (zodSchema as any).toJSONSchema() as Record<string, unknown>;
  } else {
    // Fall back to zod-to-json-schema library
    jsonSchema = zodToJsonSchemaLib(zodSchema as any, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as Record<string, unknown>;
  }

  // Remove $schema metadata key as MCP doesn't need it
  const { $schema, ...schemaWithoutMeta } = jsonSchema;

  // The zodToJsonSchema might wrap the schema in extra properties
  // Extract the actual schema if needed
  let actualSchema = schemaWithoutMeta;

  // If the result has properties but no type, add it
  if (!actualSchema.type && actualSchema.properties) {
    actualSchema = { type: 'object', ...actualSchema };
  }

  // Ensure it's an object schema
  if (actualSchema.type !== 'object') {
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
 * Converts a single SharedTool to an MCP-compatible tool entry
 *
 * @param tool - The SharedTool to convert
 * @returns MCPToolEntry compatible with @modelcontextprotocol/sdk
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { defineSharedTool, toMCPTool } from '@protolabs-ai/tools';
 *
 * const myTool = defineSharedTool({
 *   name: 'example-tool',
 *   description: 'An example tool',
 *   inputSchema: z.object({
 *     message: z.string(),
 *   }),
 *   outputSchema: z.object({
 *     result: z.string(),
 *   }),
 *   execute: async (input, context) => {
 *     return {
 *       success: true,
 *       data: { result: `Processed: ${input.message}` },
 *     };
 *   },
 * });
 *
 * const mcpTool = toMCPTool(myTool);
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
      // The SharedTool's execute function already handles validation
      // and wraps the result in ToolResult format
      return tool.execute(input as TInput, context);
    },
  };
}

/**
 * Converts multiple SharedTools to MCP-compatible tool entries
 *
 * @param tools - Array of SharedTools to convert
 * @returns Array of MCPToolEntry compatible with @modelcontextprotocol/sdk
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { defineSharedTool, toMCPTools } from '@protolabs-ai/tools';
 *
 * const tools = [
 *   defineSharedTool({
 *     name: 'tool-1',
 *     description: 'First tool',
 *     inputSchema: z.object({ input1: z.string() }),
 *     outputSchema: z.object({ output1: z.string() }),
 *     execute: async (input, context) => ({
 *       success: true,
 *       data: { output1: input.input1 },
 *     }),
 *   }),
 *   defineSharedTool({
 *     name: 'tool-2',
 *     description: 'Second tool',
 *     inputSchema: z.object({ input2: z.number() }),
 *     outputSchema: z.object({ output2: z.number() }),
 *     execute: async (input, context) => ({
 *       success: true,
 *       data: { output2: input.input2 * 2 },
 *     }),
 *   }),
 * ];
 *
 * const mcpTools = toMCPTools(tools);
 * ```
 */
export function toMCPTools(tools: SharedTool[]): MCPToolEntry[] {
  return tools.map((tool) => toMCPTool(tool));
}
