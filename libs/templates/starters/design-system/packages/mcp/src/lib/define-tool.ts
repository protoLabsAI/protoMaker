/**
 * define-tool.ts
 *
 * Minimal "define-once, deploy-everywhere" tool framework for the design-system
 * MCP server. Mirrors the SharedTool pattern from the ai-agent-app starter kit.
 *
 * A single SharedTool definition provides:
 *   - Zod input/output schema validation
 *   - Structured ToolResult (always resolves, never throws)
 *   - MCP JSON Schema conversion via toMCPTools()
 */

import { type z } from 'zod';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Dependency-injection bag passed to every tool execute() call */
export type ToolContext = Record<string, unknown>;

/** Structured result — always resolves, never throws */
export interface ToolResult<TOutput = unknown> {
  success: boolean;
  data?: TOutput;
  error?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

/** Framework-agnostic tool definition */
export interface SharedTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
  metadata?: {
    category?: string;
    tags?: string[];
    version?: string;
  };
}

/** MCP-compatible tool entry for @modelcontextprotocol/sdk */
export interface MCPToolEntry {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult<unknown>>;
}

// ─── defineSharedTool ─────────────────────────────────────────────────────────

/**
 * Factory for creating type-safe, validated tool definitions.
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { defineSharedTool } from './lib/define-tool.js';
 *
 * const myTool = defineSharedTool({
 *   name: 'my_tool',
 *   description: 'Does something useful',
 *   inputSchema: z.object({ value: z.string() }),
 *   outputSchema: z.object({ result: z.string() }),
 *   execute: async (input) => ({ success: true, data: { result: input.value } }),
 * });
 * ```
 */
export function defineSharedTool<TInput, TOutput>(definition: {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
  metadata?: { category?: string; tags?: string[]; version?: string };
}): SharedTool<TInput, TOutput> {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    execute: async (input: TInput, context: ToolContext): Promise<ToolResult<TOutput>> => {
      try {
        const validatedInput = definition.inputSchema.parse(input) as TInput;
        const result = await definition.execute(validatedInput, context);
        if (result.success && result.data !== undefined) {
          const validatedOutput = definition.outputSchema.parse(result.data) as TOutput;
          return { ...result, data: validatedOutput };
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message, metadata: { originalError: error } };
      }
    },
    metadata: definition.metadata,
  };
}

// ─── MCP Adapter ──────────────────────────────────────────────────────────────

/** Convert a Zod schema to MCP-compatible JSON Schema */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodToMCPSchema(zodSchema: any): MCPToolEntry['inputSchema'] {
  const hasToJSONSchema = zodSchema != null && typeof zodSchema.toJSONSchema === 'function';

  let jsonSchema: Record<string, unknown>;

  if (hasToJSONSchema) {
    jsonSchema = zodSchema.toJSONSchema() as Record<string, unknown>;
  } else {
    jsonSchema = zodToJsonSchemaLib(zodSchema, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as Record<string, unknown>;
  }

  const { $schema: _$schema, ...rest } = jsonSchema;
  const schema = !rest['type'] && rest['properties'] ? { type: 'object', ...rest } : rest;

  if (schema['type'] !== 'object') {
    throw new Error(`MCP tools require object input schemas, got: ${JSON.stringify(schema)}`);
  }

  return schema as MCPToolEntry['inputSchema'];
}

/**
 * Convert an array of SharedTools to MCP-compatible tool entries.
 *
 * @example
 * ```ts
 * const mcpTools = toMCPTools([colorTool, tokenTool]);
 * server.setRequestHandler(ListToolsRequestSchema, async () => ({
 *   tools: mcpTools.map(({ name, description, inputSchema }) => ({
 *     name, description, inputSchema,
 *   })),
 * }));
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toMCPTools(tools: SharedTool<any, any>[]): MCPToolEntry[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToMCPSchema(tool.inputSchema),
    handler: async (input: Record<string, unknown>, context: ToolContext) =>
      tool.execute(input as never, context),
  }));
}
