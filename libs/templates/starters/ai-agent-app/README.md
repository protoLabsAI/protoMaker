# @@PROJECT_NAME — AI Agent App Starter Kit

A full-stack AI agent app with a streaming chat UI, multi-provider LLM support, a tool system that works across MCP, LangGraph, and REST, slash commands, agent roles, and built-in observability. Follow this guide to get from `git clone` to a working agent in under five minutes.

---

## Contents

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
- [Production deployment](#production-deployment)

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
| `LANGFUSE_HOST`       |               | `https://cloud.langfuse.com` | Custom Langfuse host                                                     |

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

---

## Production deployment

### Build

```bash
npm run build        # builds all packages
```

Output:

- `packages/server/dist/` — compiled server (Node.js ESM)
- `packages/app/dist/` — compiled Vite SPA (static files)

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
