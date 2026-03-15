# Creating tools

This guide shows you how to define a tool and deploy it to the chat agent, MCP server, LangGraph flows, and Express REST endpoints — all from a single definition.

## The define-once pattern

Tools in this starter kit use `defineSharedTool` from `@@PROJECT_NAME-tools`. One definition automatically produces three runtime targets:

```
defineSharedTool
    ├── Chat agent    → registered via ToolRegistry
    ├── MCP server    → toMCPTools() for Claude Code / Claude Desktop
    ├── LangGraph     → toLangGraphTools() for agent nodes
    └── Express       → toExpressRouter() for REST endpoints
```

## Define a tool

```typescript
// packages/server/src/tools/my-tools.ts
import { defineSharedTool } from '@@PROJECT_NAME-tools';
import { z } from 'zod';

export const searchDocsTool = defineSharedTool({
  name: 'search_docs',
  description: 'Search the documentation for a given query. Returns relevant sections.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    limit: z.number().int().min(1).max(20).optional().default(5).describe('Max results'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        excerpt: z.string(),
        url: z.string(),
      })
    ),
  }),
  execute: async (input, context) => {
    // Your implementation here
    const results = await searchIndex(input.query, input.limit);
    return { success: true, data: { results } };
  },
});
```

### Tool return values

The `execute` function returns a `ToolResult`:

```typescript
// Successful result
return {
  success: true,
  data: {
    /* your output matching outputSchema */
  },
};

// Error result
return { success: false, error: 'Could not reach search index' };
```

Errors are returned as structured results, never thrown. The model receives the error message and can decide how to proceed.

### Describing inputs well

Good descriptions help the model call your tool correctly:

```typescript
inputSchema: z.object({
  // Good: specific, tells the model what format to use
  date: z.string().describe('ISO 8601 date string, e.g. "2024-01-15"'),

  // Good: explains when to use each option
  format: z
    .enum(['json', 'markdown', 'plain'])
    .describe(
      'Output format. Use "json" for programmatic use, "markdown" for display, "plain" for simple text'
    ),

  // Avoid: vague description
  query: z.string().describe('The query'),
});
```

## Register the tool with the chat agent

Import your tool in the server's tool setup file and register it:

```typescript
// packages/server/src/tools/registry.ts
import { searchDocsTool } from './my-tools.js';

registry.register(searchDocsTool);
```

The chat agent now has access to `search_docs` in every conversation.

## Add a confirmation gate

For tools with side effects (sending emails, deleting records, making purchases), require explicit user approval before execution:

```typescript
import { defineSharedTool } from '@@PROJECT_NAME-tools';

export const deleteRecordTool = Object.assign(
  defineSharedTool({
    name: 'delete_record',
    description: 'Permanently delete a record by ID',
    inputSchema: z.object({
      id: z.string().describe('The record ID to delete'),
    }),
    outputSchema: z.object({
      deleted: z.boolean(),
    }),
    execute: async (input) => {
      await db.delete(input.id);
      return { success: true, data: { deleted: true } };
    },
  }),
  { requiresConfirmation: true }
);
```

The UI renders a `ConfirmationCard` before the tool runs. The user approves or cancels. Only approved tools execute.

## Emit tool progress

For long-running tools, emit progress events to show live status in the UI:

```typescript
import { toolProgress } from '../progress.js';

execute: async (input, context) => {
  toolProgress.emit({ toolName: 'analyze_codebase', label: 'Scanning files...' });

  const files = await scanFiles(input.path);

  toolProgress.emit({ toolName: 'analyze_codebase', label: `Analyzing ${files.length} files...` });

  const results = await analyzeFiles(files);

  toolProgress.flush(); // Ensure final update sends before result
  return { success: true, data: results };
},
```

Progress events stream over a WebSocket sideband (port 3002). If the WebSocket server isn't running, `emit()` is a no-op and tools still execute normally.

## Deploy to MCP

The `packages/mcp` server exposes your tools to Claude Code and Claude Desktop. Register your tool there too:

```typescript
// packages/mcp/src/index.ts
import { searchDocsTool } from '@@PROJECT_NAME-tools/examples';
// or your own tool:
import { searchDocsTool } from '../../server/src/tools/my-tools.js';

registry.register(searchDocsTool);

const tools = toMCPTools(registry.listTools());
```

Then configure your MCP client. See [MCP integration](../integrations/mcp.md) for setup instructions.

## Deploy to LangGraph

Use `toLangGraphTools()` to include your tools in a LangGraph agent node:

```typescript
import { toLangGraphTools } from '@@PROJECT_NAME-tools/adapters/langgraph';
import { registry } from '../../server/src/tools/registry.js';

const langGraphTools = toLangGraphTools(registry.listTools());

const agentNode = createToolNode(langGraphTools);
```

## Deploy as REST endpoints

Expose your tool as an HTTP endpoint using `toExpressRouter()`:

```typescript
import { toExpressRouter } from '@@PROJECT_NAME-tools/adapters/express';
import { registry } from './registry.js';

const toolRouter = toExpressRouter(registry);
app.use('/api/tools', toolRouter);
// POST /api/tools/search_docs { query: '...', limit: 5 }
```

## Tool profiles

Tool profiles control which tools are available in which context. The server defines three profiles:

| Profile     | Tools               | Used for                  |
| ----------- | ------------------- | ------------------------- |
| `chat`      | Read-only tools     | Interactive conversations |
| `execution` | Read + write tools  | Automated agent tasks     |
| `review`    | Metadata tools only | Code review workflows     |

Register your tool with a profile:

```typescript
registry.register(searchDocsTool, { profiles: ['chat', 'execution'] });
```

Or retrieve tools for a profile:

```typescript
const tools = getAnthropicToolsForProfile('chat');
```

## Example: complete tool with progress

```typescript
import { defineSharedTool } from '@@PROJECT_NAME-tools';
import { toolProgress } from '../progress.js';
import { z } from 'zod';

export const analyzeUrlTool = defineSharedTool({
  name: 'analyze_url',
  description: 'Fetch a URL and analyze its content for key topics and sentiment.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to fetch and analyze'),
  }),
  outputSchema: z.object({
    title: z.string(),
    topics: z.array(z.string()),
    sentiment: z.enum(['positive', 'neutral', 'negative']),
    summary: z.string(),
  }),
  execute: async (input) => {
    toolProgress.emit({ toolName: 'analyze_url', label: 'Fetching page...' });
    const html = await fetch(input.url).then((r) => r.text());

    toolProgress.emit({ toolName: 'analyze_url', label: 'Analyzing content...' });
    const analysis = await analyzeContent(html);

    toolProgress.flush();
    return { success: true, data: analysis };
  },
});
```
