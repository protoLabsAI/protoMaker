/**
 * Tool registry for @@PROJECT_NAME-server.
 *
 * Centralizes all tool registrations and provides a helper to convert the
 * registered tools into the Anthropic API format required by the chat route.
 *
 * ## Registering tools
 *
 * Tools are sourced from two places:
 * 1. **Shared tools** from `@@PROJECT_NAME-tools` — reusable across MCP,
 *    LangGraph, and Express (e.g. get_weather, search_web)
 * 2. **Server-local tools** defined in `./example.ts` — server-specific
 *    implementations that don't need to be shared
 *
 * ## Tool profiles (optional pattern)
 *
 * When you have many tools, you may want to expose different subsets to
 * different agent roles. Define named profiles as arrays of tool names:
 *
 * ```typescript
 * export const TOOL_PROFILES = {
 *   // Basic tools for end-user chat
 *   chat: ['get_weather', 'get_current_time'],
 *
 *   // Full toolset for autonomous agents
 *   execution: ['get_weather', 'search_web', 'get_current_time'],
 *
 *   // Read-only tools for review/audit agents
 *   review: ['get_weather', 'get_current_time'],
 * } as const;
 *
 * export type ToolProfile = keyof typeof TOOL_PROFILES;
 *
 * // Then in your chat route:
 * const profile: ToolProfile = req.body.profile ?? 'chat';
 * const tools = getAnthropicToolsForProfile(profile);
 * ```
 */

import { ToolRegistry, getWeatherTool, searchWebTool } from '@@PROJECT_NAME-tools';
import type { SharedTool } from '@@PROJECT_NAME-tools';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';
import type Anthropic from '@anthropic-ai/sdk';
import { getCurrentTimeTool } from './example.js';

// ---------------------------------------------------------------------------
// Registry — register all application tools here
// ---------------------------------------------------------------------------

export const registry = new ToolRegistry();

registry.register(getWeatherTool);
registry.register(searchWebTool);
registry.register(getCurrentTimeTool);

// ---------------------------------------------------------------------------
// Anthropic format conversion
// ---------------------------------------------------------------------------

/**
 * Convert a SharedTool's Zod input schema to Anthropic's `input_schema` format.
 *
 * Supports both native Zod v4 `toJSONSchema()` and the `zod-to-json-schema`
 * library fallback, mirroring the pattern used in the MCP adapter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodToAnthropicSchema(zodSchema: any): Anthropic.Tool['input_schema'] {
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

  // Remove $schema metadata — Anthropic doesn't need it
  const { $schema: _$schema, ...schemaWithoutMeta } = jsonSchema;

  // Ensure type:object is present
  const schema: Record<string, unknown> = schemaWithoutMeta['type']
    ? schemaWithoutMeta
    : { type: 'object', ...schemaWithoutMeta };

  return schema as Anthropic.Tool['input_schema'];
}

/**
 * Convert a single SharedTool to Anthropic API tool format.
 */
export function toAnthropicTool(tool: SharedTool): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: zodToAnthropicSchema(tool.inputSchema),
  };
}

/**
 * Convert all tools in the registry to Anthropic API tool format.
 *
 * Pass the result directly to `anthropic.messages.create({ tools })`.
 */
export function getAnthropicTools(): Anthropic.Tool[] {
  return registry.listTools().map(toAnthropicTool);
}

// ---------------------------------------------------------------------------
// Tool profiles (optional pattern — see JSDoc above for usage)
// ---------------------------------------------------------------------------

/**
 * Named subsets of tools for different agent roles.
 *
 * - `chat`        — lightweight tools for interactive user sessions
 * - `execution`   — full toolset for autonomous agent tasks
 * - `review`      — read-only / non-mutating tools for audit agents
 *
 * This is an optional pattern. Use it when you need different tool scopes
 * per request; otherwise `getAnthropicTools()` returns all registered tools.
 */
export const TOOL_PROFILES = {
  chat: ['get_current_time', 'get_weather'],
  execution: ['get_current_time', 'get_weather', 'search_web'],
  review: ['get_current_time'],
} as const satisfies Record<string, readonly string[]>;

export type ToolProfile = keyof typeof TOOL_PROFILES;

/**
 * Get Anthropic-format tools for a named profile.
 * Tools not found in the registry are silently skipped.
 */
export function getAnthropicToolsForProfile(profile: ToolProfile): Anthropic.Tool[] {
  const names = TOOL_PROFILES[profile];
  return names
    .map((name) => registry.get(name))
    .filter((tool): tool is SharedTool => tool !== undefined)
    .map(toAnthropicTool);
}
