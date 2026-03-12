---
name: mcp-integration-patterns
emoji: 🔌
description: How to add MCP tools to the Automaker MCP server. Use when creating new MCP tools, registering handlers, or debugging MCP tool errors. Trigger on "new MCP tool", "add MCP", "tool registration", "MCP handler", or "expose via MCP".
metadata:
  author: agent
  created: 2026-02-25T00:00:00.000Z
  usageCount: 0
  successRate: 0
  tags: [mcp, api, tools, integration, typescript]
  source: learned
---

# MCP Integration Patterns

How to add, structure, and test MCP tools in the Automaker MCP server (`packages/mcp-server/`). Includes the NEVER direct API calls rule.

---

## ⛔ NEVER Make Direct API Calls

**NEVER use `curl`, `fetch`, or `axios` directly against the Automaker server.** Always use MCP tools (`mcp__plugin_protolabs_studio__*`).

```bash
# ❌ WRONG — bypasses auth, error handling, and path resolution
curl -X POST http://localhost:3008/features/list \
  -H "Authorization: Bearer $AUTOMAKER_API_KEY" \
  -d '{"projectPath": "/path/to/project"}'

# ✅ CORRECT — use the MCP tool
mcp__plugin_protolabs_studio__list_features({ projectPath: "/path/to/project" })
```

**Why?**

- MCP handles `AUTOMAKER_API_KEY` automatically (from plugin's `.env`)
- MCP returns structured responses; curl returns raw JSON/HTML
- When the API key rotates, MCP picks it up; hardcoded curl breaks
- If no MCP tool exists for an operation → that's a feature gap, create the tool

---

## MCP Tool Structure

Each tool is defined as a `Tool` object (from `@modelcontextprotocol/sdk/types.js`) with a JSON Schema `inputSchema`.

### Tool Definition (JSON Schema Format)

```typescript
// packages/mcp-server/src/tools/my-tools.ts

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const myTools: Tool[] = [
  {
    name: 'my_tool_name',
    description:
      'Clear description of what this tool does. Mention return shape. ' +
      'Used by agents to do X, Y, Z.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute path to the project directory',
        },
        featureId: {
          type: 'string',
          description: 'The feature ID (UUID)',
        },
        options: {
          type: 'object',
          description: 'Optional configuration (optional)',
          properties: {
            dryRun: { type: 'boolean', description: 'Simulate without making changes' },
          },
        },
      },
      required: ['projectPath', 'featureId'], // ← list ALL required fields
    },
  },
];
```

### Handler Function

The handler lives in `packages/mcp-server/src/index.ts` as a case in the `handleTool` switch:

```typescript
// In handleTool(name, args):
case 'my_tool_name': {
  const result = await apiCall('/my-endpoint/action', {
    projectPath: args.projectPath as string,
    featureId: args.featureId as string,
    options: args.options as Record<string, unknown> | undefined,
  });
  return result;
}
```

---

## Error Handling Pattern

All handlers must return a consistent error shape so callers can detect failures programmatically.

### Standard Error Response

```typescript
// ✅ Correct error response
return { success: false, error: 'Human-readable error description' };

// ✅ Success with data
return { success: true, featureId: 'abc-123', status: 'done' };

// ✅ Richer error with context
return {
  success: false,
  error: `Feature ${featureId} not found in project ${projectPath}`,
  code: 'FEATURE_NOT_FOUND',
};
```

> **Note:** `apiCall()` retries automatically (3× with backoff) for 5xx/network errors. Wrap in try/catch for non-retryable cases and return `{ success: false, error: e.message }`.

---

## How to Add a New Tool to the Registry

Follow these 4 steps exactly:

### Step 1 — Create or extend a tools file

Create `packages/mcp-server/src/tools/my-tools.ts` (see [MCP Tool Structure](#mcp-tool-structure) above for the exact format).

### Step 2 — Import + Register in index.ts

```typescript
// ~line 163 in packages/mcp-server/src/index.ts:
import { myTools } from './tools/my-tools.js';

// In the tools array:
const tools: Tool[] = [...featureTools, ...agentTools, ...myTools];
```

### Step 3 — Add the handler case

```typescript
// In handleTool(name, args) switch statement:
case 'my_new_tool':
  return apiCall('/my-endpoint/action', {
    projectPath: args.projectPath,
    // ... other args
  });
```

### Step 5 — Rebuild

```bash
# After modifying packages/mcp-server/src/:
npm run build:packages
```

The new tool will appear as `mcp__plugin_protolabs_studio__my_new_tool` in Claude Code after the MCP server restarts.

The `apiCall()` helper (defined in `index.ts`) calls the Automaker REST API. Base URL: `AUTOMAKER_API_URL` env var (default: `http://localhost:3008`). Auth: `Authorization: Bearer ${AUTOMAKER_API_KEY}`.

> **Two .env files:** `automaker/.env` has dev server vars; `packages/mcp-server/plugins/automaker/.env` has MCP plugin vars (`AUTOMAKER_API_KEY`, `AUTOMAKER_API_URL`). Never reference `~/.secrets/`.

---

## Testing MCP Tools

```bash
# After changes: rebuild, start dev, then call in Claude Code:
npm run build:packages && npm run dev
mcp__plugin_protolabs_studio__my_new_tool({ projectPath: "/path/to/project" })

# Debug underlying API directly (dev only):
source packages/mcp-server/plugins/automaker/.env
curl -s -X POST http://localhost:3008/my-endpoint/action \
  -H "Authorization: Bearer $AUTOMAKER_API_KEY" -H "Content-Type: application/json" \
  -d '{"projectPath": "/Users/kj/dev/automaker"}' | jq
```

Handler logic is thin (`apiCall` wrappers) — prefer integration testing via MCP. For complex logic, add unit tests in `packages/mcp-server/src/__tests__/`.

---

## Token Separation

`DISCORD_TOKEN` and `DISCORD_BOT_TOKEN` may hold the same value but are consumed differently:

- **Server** (`automaker/.env`): `DISCORD_TOKEN` — used by `DiscordBotService.initialize()` via `client.login(token)`
- **Plugin** (`packages/mcp-server/plugins/automaker/.env`): `DISCORD_BOT_TOKEN` — used by MCP Discord tools via REST API with token header

Keep both files in sync. Never commit either `.env` file — both are gitignored.

## Auto-Login

`AUTOMAKER_AUTO_LOGIN=true` (in `automaker/.env`) skips the login prompt in development. **Disabled when `NODE_ENV=production`.** Required for headless/automated operation.

## Anti-Patterns Summary

| Anti-Pattern                                      | Consequence                                   | Fix                                                     |
| ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Direct `curl`/`fetch` to Automaker API            | Auth fails after key rotation; no retry       | Use `mcp__plugin_protolabs_studio__*` tools             |
| No error response shape                           | Callers can't detect failure programmatically | Return `{ success: false, error: string }`              |
| Hardcoding `http://localhost:3008` in tools       | Breaks in staging/production                  | Use `apiCall()` — it reads `AUTOMAKER_API_URL`          |
| Adding tool definition but not the handler case   | Tool is listed but throws "Unknown tool"      | Always add both definition + case in handleTool         |
| Forgetting `npm run build:packages` after changes | MCP client still sees old tool list           | Rebuild + restart MCP server                            |
| Accessing `~/.secrets/` for credentials           | Path doesn't exist                            | Use `.env` files at project/plugin level                |
| Creating a new API route without an MCP wrapper   | Feature accessible only via curl              | Always pair new routes with an MCP tool                 |
| Committing `.env` files                           | Leaks secrets into git history                | Both `.env` files are gitignored — never force-add them |
