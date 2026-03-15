# @@PROJECT_NAME — AI Agent App Starter Kit

A full-stack AI agent platform with a streaming chat UI, multi-provider LLM support, a tool system that works across MCP, LangGraph, and REST, LangGraph flow utilities, a prompt management system, built-in observability, and a ready-to-use MCP server for Claude Code and Claude Desktop. Follow this guide to get from `git clone` to a working agent in under five minutes.

---

## Platform overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                      │
│  packages/app (Vite SPA + TanStack Router)                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ /chat  /flows  /prompts  /traces  /sessions  /settings                 │  │
│  │                                                                        │  │
│  │  packages/ui ─── streaming chat, flow builder, prompt playground       │  │
│  └─────────────────────────┬──────────────────────────────────────────────┘  │
└────────────────────────────│────────────────────────────────────────────────┘
                             │  REST + WebSocket (port 3001 / 3002)
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  packages/server (Express 5 + agentic loop)                                  │
│                                                                               │
│  packages/tools ──── shared tool definitions (MCP · LangGraph · REST)        │
│  packages/tracing ── observability (Langfuse + local file tracing)           │
│  packages/prompts ── prompt templates, roles, slash commands                 │
│  packages/flows ──── LangGraph graph builders and utilities                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  MCP clients (Claude Code, Claude Desktop, any MCP-compatible client)        │
│                                             │                                 │
│                             packages/mcp ◄──┘  (stdio transport)             │
│                             └── packages/tools (same tool definitions)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Packages

| Package            | Purpose                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| `packages/server`  | Express 5 HTTP server — agentic loop, tool execution, roles, commands, model routing |
| `packages/ui`      | React streaming chat components, flow builder canvas, prompt playground              |
| `packages/app`     | Vite SPA entry point — mounts the UI, configures TanStack Router, ships six pages    |
| `packages/tools`   | Shared tool definitions using `defineSharedTool` — adapts to MCP, LangGraph, Express |
| `packages/tracing` | Observability layer — wraps every LLM call; backends: Langfuse or local JSON files   |
| `packages/flows`   | LangGraph graph builders, routers, reducers, and HITL utilities                      |
| `packages/prompts` | Prompt templates, `PromptBuilder`, `PromptRegistry`, and `PromptLoader`              |
| `packages/mcp`     | MCP server exposing all registered tools to Claude Code and Claude Desktop           |

### UI pages

The `packages/app` SPA ships six pages via TanStack Router's file-based routing:

| Route       | Page              | What it does                                                       |
| ----------- | ----------------- | ------------------------------------------------------------------ |
| `/chat`     | Chat              | Streaming conversation with tool calling and role switching        |
| `/flows`    | Flow builder      | Visual LangGraph flow designer with TypeScript code export         |
| `/prompts`  | Prompt playground | Edit, test, and iterate on prompt templates with live model output |
| `/traces`   | Trace viewer      | Table of recent completions — tokens, latency, cost estimates      |
| `/sessions` | Session history   | Browse and restore past conversations                              |
| `/settings` | Settings          | Model provider, API keys, theme, and WebSocket configuration       |

---

## What can I build?

| Project                     | How it fits                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Customer support bot**    | Register tools that query your CRM, create tickets, and look up order status. Slot into the existing chat UI in an afternoon.      |
| **Code review agent**       | Use the built-in `code-reviewer` role or write a custom one. Stream structured feedback directly in the chat window.               |
| **Research assistant**      | Build a `search_web` + `summarize` tool chain with a LangGraph loop that iterates until a quality gate passes.                     |
| **Internal knowledge base** | Add a `search_docs` tool backed by your vector store. The same definition works in the chat UI and as an MCP tool for Claude Code. |
| **Data analysis agent**     | Register a `run_sql` tool, let the model write and execute queries, then render results with a custom tool card renderer.          |
| **Workflow orchestrator**   | Use the Flow Builder to design a multi-step LangGraph pipeline visually, then export it as TypeScript and wire it to your data.    |

> **Deep dives →** [Agent architecture](docs/concepts/agent-architecture.md) · [Building flows](docs/guides/building-flows.md) · [Creating tools](docs/guides/creating-tools.md)

---

## Contents

- [Platform overview](#platform-overview)
- [What can I build?](#what-can-i-build)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Add a custom tool](#add-a-custom-tool)
- [Register a tool card renderer](#register-a-tool-card-renderer)
- [Switch providers](#switch-providers)
- [Theming](#theming)
- [Sessions](#sessions)
- [Slash commands](#slash-commands)
- [Agent roles](#agent-roles)
- [Tracing and observability](#tracing-and-observability)
- [LangGraph flows](#langgraph-flows)
- [Prompt management](#prompt-management)
- [MCP server](#mcp-server)
- [Production deployment](#production-deployment)
- [Documentation](#documentation)

---

## Prerequisites

| Requirement    | Version | Notes                                                                              |
| -------------- | ------- | ---------------------------------------------------------------------------------- |
| Node.js        | ≥ 20    | `node --version` to check                                                          |
| npm            | ≥ 10    | ships with Node 20                                                                 |
| An LLM API key | —       | Anthropic, OpenAI, or Google (see [Environment variables](#environment-variables)) |

---

## Quick start

```bash
# 1. Rename the placeholder package names
find . -type f \( -name "*.json" -o -name "*.ts" -o -name "*.tsx" \) \
  | xargs sed -i '' 's/@@PROJECT_NAME/my-agent/g'

# 2. Install dependencies
npm install

# 3. Set your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > packages/server/.env

# 4. Start server + UI in parallel
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). You should see a streaming chat window. The server runs on port 3001 by default.

> **Full walkthrough →** [Getting started](docs/getting-started/quickstart.md)

---

## Environment variables

All variables are read from `packages/server/.env` (or the process environment in production). None are required at build time.

| Variable              | Required      | Default                      | Description                                                              |
| --------------------- | ------------- | ---------------------------- | ------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`   | ✓ (Anthropic) | —                            | Anthropic API key                                                        |
| `OPENAI_API_KEY`      | ✓ (OpenAI)    | —                            | OpenAI API key                                                           |
| `GOOGLE_API_KEY`      | ✓ (Google)    | —                            | Google Generative AI API key                                             |
| `MODEL`               |               | `opus`                       | Model alias or full model ID (see [Switch providers](#switch-providers)) |
| `PORT`                |               | `3001`                       | HTTP server port                                                         |
| `WS_PORT`             |               | `3002`                       | WebSocket sideband port (tool progress events)                           |
| `CORS_ORIGIN`         |               | unrestricted                 | Allowed CORS origin, e.g. `http://localhost:5173`                        |
| `LANGFUSE_PUBLIC_KEY` |               | —                            | Enable Langfuse tracing (see [Tracing](#tracing-and-observability))      |
| `LANGFUSE_SECRET_KEY` |               | —                            | Required when `LANGFUSE_PUBLIC_KEY` is set                               |
| `LANGFUSE_HOST`       |               | `https://cloud.langfuse.com` | Custom Langfuse host for self-hosted deployments                         |

> **Full Langfuse setup →** [Langfuse integration](docs/integrations/langfuse.md)

---

## Add a custom tool

Tools are defined once using `defineSharedTool` and automatically adapt to MCP, LangGraph, and Express. You can define tools in the shared `packages/tools` package (for reuse across runtimes) or directly in `packages/server` (for server-specific logic).

### Option A — server-local tool (simplest)

Create your tool in `packages/server/src/tools/` alongside the existing examples:

```typescript
// packages/server/src/tools/my-tool.ts
import { z } from 'zod';
import { defineSharedTool } from '@@PROJECT_NAME-tools';

export const searchDocsTool = defineSharedTool({
  name: 'search_docs',
  description: 'Search the product documentation for answers.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    limit: z.number().optional().default(5).describe('Max results to return'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      })
    ),
  }),
  execute: async (input) => {
    // Replace with your actual search logic
    const results = await mySearchApi(input.query, input.limit);
    return { success: true, data: { results } };
  },
});
```

Then register it in `packages/server/src/tools/registry.ts`:

```typescript
import { searchDocsTool } from './my-tool.js';

registerTool(searchDocsTool);
```

### Option B — shared tool (reusable across runtimes)

Place the tool in `packages/tools/src/examples/` and export it from `packages/tools/src/index.ts`. The MCP adapter, LangGraph adapter, and Express adapter all pick it up automatically.

### Tools with side effects (confirmation gate)

To require user confirmation before a tool runs, attach `requiresConfirmation: true` using `Object.assign`:

```typescript
export const sendEmailTool = Object.assign(
  defineSharedTool({ name: 'send_email', ... }),
  { requiresConfirmation: true as const }
);
```

The server's `toolRequiresConfirmation(name)` check will gate this tool before execution.

> **Complete tool guide →** [Creating tools](docs/guides/creating-tools.md) · [Tool adapters reference](docs/reference/tool-adapters.md)

---

## Register a tool card renderer

When a tool returns a result, the chat UI renders it as JSON by default. You can register a custom card component to display rich output.

Create a card component in `packages/ui/src/tool-results/`:

```tsx
// packages/ui/src/tool-results/search-docs-card.tsx
interface SearchDocsOutput {
  results: { title: string; url: string; snippet: string }[];
}

export function SearchDocsCard({ output }: { output: SearchDocsOutput }) {
  return (
    <div className="space-y-2">
      {output.results.map((r) => (
        <a key={r.url} href={r.url} className="block rounded border p-3 hover:bg-[var(--accent)]">
          <p className="font-medium text-[var(--foreground)]">{r.title}</p>
          <p className="text-sm text-[var(--muted-foreground)]">{r.snippet}</p>
        </a>
      ))}
    </div>
  );
}
```

Register it in the tool result registry alongside the existing `WeatherCard`:

```tsx
import { SearchDocsCard } from '../tool-results/search-docs-card.js';

const TOOL_CARD_REGISTRY: Record<string, React.ComponentType<{ output: unknown }>> = {
  get_weather: WeatherCard,
  search_docs: SearchDocsCard as React.ComponentType<{ output: unknown }>,
};
```

The registry key must match the tool's `name` field exactly.

---

## Switch providers

The server resolves models through a short alias table in `packages/server/src/model-resolver.ts`. You can switch providers by setting the `MODEL` environment variable — no code changes needed.

### Supported aliases

| Alias              | Provider  | Full model ID       |
| ------------------ | --------- | ------------------- |
| `haiku`            | Anthropic | `claude-haiku-4-5`  |
| `sonnet`           | Anthropic | `claude-sonnet-4-6` |
| `opus` _(default)_ | Anthropic | `claude-opus-4-6`   |
| `gpt-4o`           | OpenAI    | `gpt-4o`            |
| `gpt-4o-mini`      | OpenAI    | `gpt-4o-mini`       |
| `gemini-2.0-flash` | Google    | `gemini-2.0-flash`  |

```bash
# Use GPT-4o instead of the default Anthropic model
MODEL=gpt-4o OPENAI_API_KEY=sk-... npm run dev

# Pass a full model ID directly
MODEL=claude-3-5-haiku-20241022 ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

### Add a new provider

1. Add the provider's SDK as a dependency in `packages/server/package.json`.
2. Add model aliases to the appropriate map in `model-resolver.ts`.
3. Add a `getMyProviderClient()` singleton factory following the pattern used by `getAnthropicClient()`.
4. Handle the new provider name in the `getProviderClient()` switch statement.
5. Set the corresponding `*_API_KEY` environment variable.

---

## Theming

The UI uses CSS custom properties for all color tokens. To rebrand, edit the six core variables in your app's tokens file:

```css
/* packages/app/src/styles/tokens.css (or equivalent) */
:root {
  --primary: 210 100% 56%; /* hsl — main brand color */
  --background: 0 0% 100%;
  --card: 0 0% 98%;
  --foreground: 222 47% 11%;
  --border: 220 13% 91%;
  --ring: 210 100% 56%;
}

.dark {
  --primary: 210 100% 65%;
  --background: 222 47% 11%;
  --card: 222 47% 14%;
  --foreground: 0 0% 98%;
  --border: 220 13% 20%;
  --ring: 210 100% 65%;
}
```

All UI components consume these variables via Tailwind's arbitrary-value syntax (`bg-[var(--primary)]`), so changing the six values above recolors the entire interface.

### Dark mode

Dark mode is toggled by adding the `dark` class to `<html>`. The `ThemeToggle` component does this automatically. To default to dark mode, add the class in `index.html`:

```html
<html lang="en" class="dark"></html>
```

---

## Sessions

The chat UI persists conversation history to `localStorage` using a session store. Each session has a unique ID and a title derived from the first message.

### How sessions work

- Sessions are created automatically on the first message.
- Up to 50 sessions are stored; older sessions are evicted in LRU order (by last activity).
- Switching sessions saves the current one before loading the new one.
- Session data lives entirely in the browser — nothing is sent to the server.

### Access the session store

```typescript
import { useSessionStore } from '../lib/session-store.js';

const { sessions, currentSessionId, createSession, switchSession, deleteSession } =
  useSessionStore();
```

### Persist sessions server-side

The default implementation is browser-only. To add server-side persistence, replace the `localStorage` calls in `packages/ui/src/lib/session-store.ts` with API calls to your own backend.

---

## Slash commands

Typing `/` in the chat input activates command mode. Commands expand into a system-prompt prefix that shapes how the model responds, without replacing any existing system prompt.

### Built-in commands

| Command         | Effect                                                |
| --------------- | ----------------------------------------------------- |
| `/summarize`    | Asks the model to summarize the conversation so far   |
| `/eli5 [topic]` | Asks the model to explain a concept in plain language |
| `/bullets`      | Asks the model to reply in bullet points              |

### Add a command

Open `packages/server/src/commands/example.ts` and call `registerCommand`:

```typescript
import { registerCommand } from './registry.js';

registerCommand({
  name: 'formal',
  description: 'Ask the assistant to respond in a formal, professional tone.',
  expand: (_args: string): string =>
    'Please respond in a formal, professional tone. ' +
    'Use complete sentences, avoid contractions, and maintain a respectful register.',
});
```

The command is available immediately — no restart needed during development.

### How commands expand

When the user types `/formal` and sends a message, the server:

1. Detects the `/formal` prefix in the last user message.
2. Calls `expand('')` to get the instruction string.
3. Prepends it to the system prompt: `expansion + '\n\n' + existingSystem`.
4. Sends the combined prompt to the model.

The slash command text is removed from the user message before it is added to the conversation history.

### List available commands from the client

```typescript
const commands = await fetch('/api/commands').then((r) => r.json());
// [{ name: 'summarize', description: '...' }, ...]
```

> **Prompt engineering guide →** [Prompt engineering concepts](docs/concepts/prompt-engineering.md)

---

## Agent roles

Roles let you give the model a persona or area of expertise. Selecting a role injects a different system prompt into every request.

### Built-in roles

| Role ID         | Name          | Purpose                                     |
| --------------- | ------------- | ------------------------------------------- |
| `assistant`     | Assistant     | General-purpose helpful assistant (default) |
| `code-reviewer` | Code Reviewer | Expert code review with structured feedback |

### Use a role in a request

Fetch the role from the server and pass its `systemPrompt` (and optionally `defaultModel`) to `/api/chat`:

```typescript
// Fetch all roles
const roles = await fetch('/api/roles').then((r) => r.json());
const role = roles.find((r) => r.id === 'code-reviewer');

// Apply the role to a chat request
fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages,
    system: role.systemPrompt,
    model: role.defaultModel, // omit to use the server's MODEL env default
  }),
});
```

The `RoleSelector` component in the UI does this automatically when the user picks a role from the toolbar.

### Add a role

Open `packages/server/src/roles/assistant.ts` and call `registerRole`:

```typescript
import { registerRole } from './index.js';

registerRole({
  id: 'data-analyst',
  name: 'Data Analyst',
  defaultModel: 'gpt-4o', // optional: override the MODEL env var for this role
  systemPrompt: [
    'You are an expert data analyst.',
    'When given data, first identify patterns and outliers.',
    'Present findings as numbered insights with supporting evidence.',
    'Recommend follow-up analyses when relevant.',
  ].join('\n'),
});
```

The file is loaded via side-effect import in `packages/server/src/routes/roles.ts`, so the role is available immediately without additional wiring.

### Roles API

```
GET /api/roles          → AgentRole[]
GET /api/roles/:id      → AgentRole | 404
```

---

## Tracing and observability

The `packages/tracing` package wraps every LLM call with trace metadata. By default it writes traces to `.traces/` as JSON files. To upgrade to Langfuse, set two environment variables:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

When both variables are present, `createTracingConfig()` automatically activates Langfuse. No code changes needed.

### View local traces

```bash
ls .traces/
# trace-1715000000000.json
# trace-1715000001234.json
```

Or use the built-in trace viewer at [http://localhost:5173/traces](http://localhost:5173/traces), which polls `GET /api/traces` and displays a table of recent completions with token counts and latency.

### Tool progress events

Long-running tools emit progress updates over a WebSocket sideband (default port 3002). The UI connects automatically and displays live status labels while the tool runs. The sideband is optional — if the WebSocket port is unavailable, tools still execute; only the progress labels are missing.

> **Tracing guide →** [Tracing and debugging](docs/guides/tracing-debugging.md) · [Langfuse integration](docs/integrations/langfuse.md)

---

## LangGraph flows

The `packages/flows` package provides typed graph builders, routers, reducers, and HITL utilities that wrap `@langchain/langgraph`. Use them to build multi-step agent pipelines — without writing LangGraph boilerplate.

### Three graph topologies

```typescript
import { createLinearGraph, createLoopGraph, createBranchingGraph } from '@@PROJECT_NAME-flows';

// Sequential: A → B → C → END
const pipeline = createLinearGraph({
  nodes: [researchNode, analyzeNode, writeNode],
  stateAnnotation: myStateAnnotation,
});

// Loop: generate → review → (approve → END | revise → generate)
const iterative = createLoopGraph({
  primaryNode: generateNode,
  loopNode: reviewNode,
  router: createBinaryRouter((state) => (state.approved ? '__end__' : 'generate')),
  stateAnnotation: myStateAnnotation,
});

// Branching: classify → (route A | route B | route C)
const branching = createBranchingGraph({
  routerNode: classifyNode,
  branches: { support: supportNode, billing: billingNode, general: generalNode },
  stateAnnotation: myStateAnnotation,
});
```

### Visual flow builder

The `/flows` page in the UI provides a drag-and-drop canvas. Connect Agent, Tool, Condition, State, and HITL nodes visually, then export the design as TypeScript that imports from `@@PROJECT_NAME-flows`.

### HITL (human-in-the-loop)

Use `createSubgraphBridge` to pause a flow, await human approval, and resume with the decision:

```typescript
import { createSubgraphBridge } from '@@PROJECT_NAME-flows';

const approvedFlow = createSubgraphBridge(mySubgraph, {
  checkpointKey: 'approval',
  pendingCheck: (state) => state.pendingApproval,
});
```

> **Flow guide →** [Building flows](docs/guides/building-flows.md)

---

## Prompt management

The `packages/prompts` package manages prompt templates stored as git-tracked markdown files with YAML frontmatter.

### Define a prompt template

Create a file in `prompts/` at the project root:

```markdown
---
id: weekly-summary
model: sonnet
version: 1
variables:
  - teamName
  - weekOf
---

You are a technical writer summarizing {{teamName}}'s work for the week of {{weekOf}}.

Focus on: decisions made, blockers cleared, and next steps.
Format your response as a concise executive summary (200–300 words).
```

### Load and use a template

```typescript
import { PromptLoader, PromptRegistry } from '@@PROJECT_NAME-prompts';

const loader = new PromptLoader('./prompts');
const registry = new PromptRegistry();
await loader.loadAll(registry);

const prompt = registry.createPromptFromTemplate('weekly-summary', {
  teamName: 'Platform',
  weekOf: '2025-01-13',
});
```

### Prompt playground

Browse and test all registered prompts at [http://localhost:5173/prompts](http://localhost:5173/prompts). Edit a template, fill in variables, and run it against the live model — no restarts needed.

> **Prompt guide →** [Prompt playground](docs/guides/prompt-playground.md) · [Prompt engineering](docs/concepts/prompt-engineering.md)

---

## MCP server

The `packages/mcp` package exposes every tool registered in `packages/tools` to any MCP-compatible client — including Claude Code and Claude Desktop — via the stdio transport.

### Run the MCP server

```bash
node packages/mcp/dist/index.js
```

### Connect Claude Code

Add this to `.claude/settings.json` in your project:

```json
{
  "mcpServers": {
    "@@PROJECT_NAME": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"]
    }
  }
}
```

### Connect Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "@@PROJECT_NAME": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"]
    }
  }
}
```

After connecting, all tools from `packages/tools` are immediately available to Claude without any additional setup.

> **MCP guide →** [MCP integration](docs/integrations/mcp.md)

---

## Production deployment

### Build

```bash
npm run build        # builds all packages
```

Output:

- `packages/server/dist/` — compiled server (Node.js ESM)
- `packages/app/dist/` — compiled Vite SPA (static files)
- `packages/mcp/dist/` — compiled MCP server

### Start the server

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export MODEL=sonnet
export PORT=3001
export NODE_ENV=production

node packages/server/dist/index.js
```

### Serve the UI

Point a static file server or CDN at `packages/app/dist/`. The UI connects to the server at the `VITE_SERVER_URL` build-time variable (defaults to relative paths, which works when server and UI share the same origin):

```bash
# Build with an explicit server URL
VITE_SERVER_URL=https://api.example.com npm run build --workspace=packages/app
```

### Docker (example)

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
COPY --from=build /app/packages/server/dist ./dist
COPY --from=build /app/packages/server/package.json .
RUN npm install --omit=dev
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Health check

```
GET /api/health → { "status": "ok", "model": "claude-opus-4-6", "provider": "anthropic" }
```

Use this endpoint for load balancer health checks and uptime monitors.

### Security checklist

- Set `CORS_ORIGIN` to your UI's origin (e.g. `https://app.example.com`).
- Never commit `.env` files — add them to `.gitignore`.
- Add authentication middleware in `packages/server/src/index.ts` before the API routes.
- Tools with `requiresConfirmation: true` already gate dangerous operations — audit these before deploying.

---

## Documentation

| Topic                   | Link                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| Quick start             | [docs/getting-started/quickstart.md](docs/getting-started/quickstart.md)   |
| Agent architecture      | [docs/concepts/agent-architecture.md](docs/concepts/agent-architecture.md) |
| Prompt engineering      | [docs/concepts/prompt-engineering.md](docs/concepts/prompt-engineering.md) |
| Creating tools          | [docs/guides/creating-tools.md](docs/guides/creating-tools.md)             |
| Building flows          | [docs/guides/building-flows.md](docs/guides/building-flows.md)             |
| Prompt playground       | [docs/guides/prompt-playground.md](docs/guides/prompt-playground.md)       |
| Tracing and debugging   | [docs/guides/tracing-debugging.md](docs/guides/tracing-debugging.md)       |
| MCP integration         | [docs/integrations/mcp.md](docs/integrations/mcp.md)                       |
| Langfuse integration    | [docs/integrations/langfuse.md](docs/integrations/langfuse.md)             |
| Tool adapters reference | [docs/reference/tool-adapters.md](docs/reference/tool-adapters.md)         |
