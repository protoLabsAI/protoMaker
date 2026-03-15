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

import { ToolRegistry, searchWebTool } from '@@PROJECT_NAME-tools';
import type { SharedTool } from '@@PROJECT_NAME-tools';
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema';
import type Anthropic from '@anthropic-ai/sdk';
import { getCurrentTimeTool, getWeatherTool } from './example.js';

// ---------------------------------------------------------------------------
// Server-local ToolDefinition — extends SharedTool with confirmation flag
// ---------------------------------------------------------------------------

/**
 * Extended tool definition for server-side tools.
 *
 * Adds a `requiresConfirmation` flag to the base `SharedTool` interface so
 * the chat route (or any caller) can gate tool execution behind a
 * user-approval step before proceeding.
 *
 * The flag lives here rather than in the shared package because the shared
 * package is intentionally framework-agnostic and has no concept of
 * human-in-the-loop confirmation.
 *
 * Use `registerTool()` instead of `registry.register()` to preserve the flag.
 *
 * @example
 * ```typescript
 * import { defineSharedTool } from '@@PROJECT_NAME-tools';
 * import { registerTool } from './registry.js';
 *
 * const sensitiveOp = Object.assign(
 *   defineSharedTool({ name: 'send_email', ... }),
 *   { requiresConfirmation: true },
 * );
 *
 * registerTool(sensitiveOp); // confirmation flag is preserved in the set
 * ```
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> extends SharedTool<
  TInput,
  TOutput
> {
  /**
   * When `true`, callers should request explicit user confirmation before
   * executing this tool.  Useful for tools with irreversible side effects
   * such as sending messages, modifying external records, or making payments.
   */
  requiresConfirmation?: boolean;
}

// ---------------------------------------------------------------------------
// Registry — register all application tools here
// ---------------------------------------------------------------------------

export const registry = new ToolRegistry();

/** Set of tool names that require user confirmation before execution. */
const confirmationRequired = new Set<string>();

/**
 * Register a tool with the registry, tracking its `requiresConfirmation` flag.
 *
 * Prefer this over `registry.register()` so the confirmation flag is not
 * silently dropped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTool(
  tool: SharedTool<any, any> & { requiresConfirmation?: boolean }
): void {
  registry.register(tool);
  if (tool.requiresConfirmation) {
    confirmationRequired.add(tool.name);
  }
}

/**
 * Check whether a registered tool requires user confirmation before execution.
 *
 * @example
 * ```typescript
 * if (toolRequiresConfirmation('get_weather')) {
 *   const ok = await promptUser('Allow weather lookup?');
 *   if (!ok) return;
 * }
 * await registry.execute('get_weather', input);
 * ```
 */
export function toolRequiresConfirmation(name: string): boolean {
  return confirmationRequired.has(name);
}

/**
 * Return the names of all registered tools that require user confirmation.
 * Useful for surfacing a gated-tool list to client UIs.
 */
export function getConfirmationRequiredTools(): string[] {
  return Array.from(confirmationRequired);
}

// Register tools — use registerTool() to preserve requiresConfirmation flags.
// get_weather is defined server-locally in example.ts with requiresConfirmation: true.
registerTool(getWeatherTool);
registerTool(searchWebTool);
registerTool(getCurrentTimeTool);

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
