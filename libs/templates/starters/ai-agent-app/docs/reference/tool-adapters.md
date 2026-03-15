# Tool adapters reference

This page documents the API for `defineSharedTool`, `ToolRegistry`, and the three deployment adapters.

## defineSharedTool

Creates a tool definition that works across all adapters.

```typescript
import { defineSharedTool } from '@@PROJECT_NAME-tools';

const tool = defineSharedTool(config);
```

### Config

| Field          | Type        | Required | Description                                                                                |
| -------------- | ----------- | -------- | ------------------------------------------------------------------------------------------ |
| `name`         | `string`    | Yes      | Snake-case tool identifier. Must be unique in the registry.                                |
| `description`  | `string`    | Yes      | Shown to the model. Describe what the tool does, when to use it, and what the inputs mean. |
| `inputSchema`  | `z.ZodType` | Yes      | Zod schema for the tool's input. Fields should have `.describe()` annotations.             |
| `outputSchema` | `z.ZodType` | Yes      | Zod schema for the tool's output data (the `data` field in a successful result).           |
| `execute`      | `function`  | Yes      | Async function that performs the tool's work.                                              |

### execute signature

```typescript
execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
```

**`input`** — The validated input object, typed from `inputSchema`.

**`context`** — A `Record<string, unknown>` with runtime context. The shape depends on how the tool is deployed (MCP, Express, or LangGraph). Treat it as an untyped bag of request metadata.

### ToolResult

```typescript
// Successful result
{
  success: true;
  data: TOutput;
}

// Error result
{
  success: false;
  error: string;
}
```

Always return a `ToolResult`, never throw. Thrown errors are caught by the adapter's error boundary and converted to error results automatically, but returning explicitly gives you control over the error message the model sees.

---

## ToolRegistry

A registry holds tool definitions and converts them to adapter-specific formats.

```typescript
import { ToolRegistry } from '@@PROJECT_NAME-tools';

const registry = new ToolRegistry();
```

### Methods

#### register

```typescript
registry.register(tool: SharedTool<any, any>, options?: RegisterOptions): void
```

Registers a tool. Optionally attaches profile membership.

```typescript
registry.register(searchTool, { profiles: ['chat', 'execution'] });
```

#### listTools

```typescript
registry.listTools(): SharedTool<any, any>[]
```

Returns all registered tools.

#### getAnthropicTools

```typescript
registry.getAnthropicTools(): AnthropicTool[]
```

Returns tools in Anthropic SDK format (for direct use with `streamText({ tools })`).

#### getAnthropicToolsForProfile

```typescript
getAnthropicToolsForProfile(profile: 'chat' | 'execution' | 'review'): AnthropicTool[]
```

Returns tools filtered by the given profile.

#### toolRequiresConfirmation

```typescript
registry.toolRequiresConfirmation(name: string): boolean
```

Returns `true` if the tool was registered with `requiresConfirmation: true`.

#### getConfirmationRequiredTools

```typescript
registry.getConfirmationRequiredTools(): string[]
```

Returns names of all tools that require confirmation.

### RegisterOptions

| Field      | Type       | Description                         |
| ---------- | ---------- | ----------------------------------- |
| `profiles` | `string[]` | Profile names this tool belongs to. |

---

## requiresConfirmation flag

Mark a tool as requiring user approval before it executes:

```typescript
const dangerousTool = Object.assign(defineSharedTool({ name: 'delete_all' /* ... */ }), {
  requiresConfirmation: true,
});

registry.register(dangerousTool);
```

The UI renders a `ConfirmationCard` component before the tool runs.

---

## MCP adapter

Converts a list of tools to MCP protocol format.

```typescript
import { toMCPTools } from '@@PROJECT_NAME-tools/adapters/mcp';

const mcpTools = toMCPTools(registry.listTools());
```

### toMCPTools

```typescript
toMCPTools(tools: SharedTool<any, any>[]): MCPTool[]
```

Returns tools formatted for the MCP SDK's `ListToolsResult.tools` field.

Each MCP tool has:

| Field         | Source                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| `name`        | `tool.name`                                                            |
| `description` | `tool.description`                                                     |
| `inputSchema` | JSON Schema converted from `tool.inputSchema` via `zod-to-json-schema` |

### Handling MCP tool calls

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = registry.listTools().find((t) => t.name === request.params.name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const result = await tool.execute(request.params.arguments ?? {}, {});

  return {
    content: [
      {
        type: 'text',
        text: result.success ? JSON.stringify(result.data) : result.error,
      },
    ],
    isError: !result.success,
  };
});
```

---

## LangGraph adapter

Converts tools to LangGraph `DynamicStructuredTool` format.

```typescript
import { toLangGraphTools } from '@@PROJECT_NAME-tools/adapters/langgraph';

const langGraphTools = toLangGraphTools(registry.listTools());
```

### toLangGraphTools

```typescript
toLangGraphTools(tools: SharedTool<any, any>[]): DynamicStructuredTool[]
```

Requires `@langchain/core` as a peer dependency. Install it in the consuming package:

```bash
npm install @langchain/core
```

Each returned `DynamicStructuredTool` has:

| Field         | Source                                         |
| ------------- | ---------------------------------------------- |
| `name`        | `tool.name`                                    |
| `description` | `tool.description`                             |
| `schema`      | `tool.inputSchema` (Zod schema, used directly) |
| `func`        | Wrapper around `tool.execute`                  |

### Use in a LangGraph node

```typescript
import { createToolNode } from '@@PROJECT_NAME-flows';

const tools = toLangGraphTools(registry.listTools());
const toolNode = createToolNode(tools);

graph.addNode('tools', toolNode);
```

---

## Express adapter

Mounts tools as POST endpoints on an Express router.

```typescript
import { toExpressRouter } from '@@PROJECT_NAME-tools/adapters/express';

const toolRouter = toExpressRouter(registry);
app.use('/api/tools', toolRouter);
```

### toExpressRouter

```typescript
toExpressRouter(registry: ToolRegistry): express.Router
```

Creates one route per registered tool:

```
POST /api/tools/:toolName
```

**Request body**: JSON object matching the tool's `inputSchema`.

**Response**:

```json
// Success
{ "success": true, "data": { /* tool output */ } }

// Error
{ "success": false, "error": "description of what went wrong" }
```

**Status codes**:

| Code | Meaning                                          |
| ---- | ------------------------------------------------ |
| 200  | Tool executed (check `success` field for result) |
| 400  | Request body failed schema validation            |
| 404  | Tool not found                                   |
| 500  | Unexpected server error                          |

### Example call

```bash
curl -X POST http://localhost:3001/api/tools/search_docs \
  -H 'Content-Type: application/json' \
  -d '{ "query": "state management", "limit": 3 }'
```

---

## Tool examples package

The package ships example tools in `@@PROJECT_NAME-tools/examples`:

```typescript
import { getWeatherTool, searchWebTool } from '@@PROJECT_NAME-tools/examples';
```

| Tool             | Name          | Description                          |
| ---------------- | ------------- | ------------------------------------ |
| `getWeatherTool` | `get_weather` | Returns mock weather data for a city |
| `searchWebTool`  | `search_web`  | Returns mock web search results      |

Use these as copy-paste starting points for your own tools.

---

## Type reference

```typescript
// Core types exported from @@PROJECT_NAME-tools
export type { SharedTool, ToolResult, ToolContext, ToolRegistry };

// Adapter types
export type { MCPTool } from '@@PROJECT_NAME-tools/adapters/mcp';
```
