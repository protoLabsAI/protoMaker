# MCP integration

This page covers how to expose your tools to Claude Code and Claude Desktop using the Model Context Protocol (MCP).

## What MCP is for

MCP (Model Context Protocol) lets AI assistants like Claude Code and Claude Desktop call tools that run on your machine. Once connected, Claude can use your `search_docs` or `analyze_url` tools directly from a conversation — without going through your web app.

This is useful for:

- Giving Claude Code access to project-specific tools during development
- Building developer productivity tools that Claude uses autonomously
- Sharing tools with teammates who use Claude Desktop

## How it works

The `packages/mcp` package runs a lightweight Node.js server that speaks the MCP protocol over stdio. It imports tools from `@@PROJECT_NAME-tools` and exposes them to any MCP client.

```
Claude Code / Claude Desktop
  ↕ stdio (MCP protocol)
packages/mcp/src/index.ts
  → ToolRegistry
  → your tools (getWeatherTool, searchWebTool, ...)
```

## Build the MCP server

From the project root:

```bash
cd packages/mcp
npm run build
```

This compiles `packages/mcp/src/index.ts` to `packages/mcp/dist/index.js`.

## Connect to Claude Code

Add the MCP server to Claude Code's settings. Create or edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "my-agent-tools": {
      "command": "node",
      "args": ["/absolute/path/to/my-agent-app/packages/mcp/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Replace `/absolute/path/to/my-agent-app` with the actual path to your project.

Restart Claude Code after editing the settings file. Run `/mcp` in Claude Code to verify the connection shows `my-agent-tools` as connected.

## Connect to Claude Desktop

Edit the Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-agent-tools": {
      "command": "node",
      "args": ["/absolute/path/to/my-agent-app/packages/mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. Your tools appear in the tools panel.

## Add your own tools

Open `packages/mcp/src/index.ts`:

```typescript
import { ToolRegistry } from '@@PROJECT_NAME-tools';
import { toMCPTools } from '@@PROJECT_NAME-tools/adapters/mcp';
import { getWeatherTool, searchWebTool } from '@@PROJECT_NAME-tools/examples';

// Import your custom tool
import { searchDocsTool } from '../../server/src/tools/my-tools.js';

const registry = new ToolRegistry();
registry.register(getWeatherTool);
registry.register(searchWebTool);
registry.register(searchDocsTool); // Add your tool here

const tools = toMCPTools(registry.listTools());
```

Rebuild the MCP server after changes:

```bash
cd packages/mcp && npm run build
```

Claude Code and Claude Desktop will pick up the new tools after reconnecting.

## Test the MCP server locally

Run the MCP server directly to verify it starts without errors:

```bash
node packages/mcp/dist/index.js
```

It should start silently and wait for MCP protocol messages on stdin. Stop it with Ctrl+C.

To test tool availability, use the MCP inspector:

```bash
npx @modelcontextprotocol/inspector node packages/mcp/dist/index.js
```

This opens a browser UI that lists your tools and lets you call them manually.

## Use tools from Claude

Once connected, Claude automatically knows about your tools and calls them when relevant.

To invoke explicitly, ask Claude:

```
Use the search_docs tool to find documentation about state management.
```

Or just ask your question and Claude will decide when to call the tool:

```
How does state work in LangGraph? Check the docs if needed.
```

## Publish the MCP server as a CLI

The `packages/mcp/package.json` defines a `bin` entry:

```json
{
  "bin": {
    "@@PROJECT_NAME-mcp": "./dist/index.js"
  }
}
```

After replacing `@@PROJECT_NAME` with your actual project name, you can publish the package to npm and install it globally:

```bash
# After publishing
npm install -g my-project-mcp

# Configure Claude Code to use it
{
  "mcpServers": {
    "my-project": {
      "command": "my-project-mcp"
    }
  }
}
```

This makes it easy to share your tools with teammates without requiring them to clone your repository.

## Environment variables in MCP servers

MCP servers run as child processes of the MCP client. Pass environment variables in the settings file:

```json
{
  "mcpServers": {
    "my-agent-tools": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "DATABASE_URL": "postgresql://localhost/mydb",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Access them in your tool's `execute` function:

```typescript
execute: async (input) => {
  const db = createClient(process.env.DATABASE_URL!);
  const result = await db.query(input.query);
  return { success: true, data: { rows: result.rows } };
},
```

## MCP tool protocol

Each tool is exposed as an MCP tool with:

- **name**: the tool's `name` field
- **description**: the tool's `description` field
- **inputSchema**: JSON Schema converted from the Zod `inputSchema`

Tool results are returned as text:

```typescript
// Success
{ content: [{ type: 'text', text: JSON.stringify(result.data) }] }

// Error
{ content: [{ type: 'text', text: result.error }], isError: true }
```

Claude parses the JSON text and incorporates the data into its response.
