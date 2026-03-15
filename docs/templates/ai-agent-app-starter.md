---
outline: deep
---

# Create an AI agent app

This guide covers scaffolding and customizing the AI agent app starter. By the end you have a running three-package npm monorepo with a streaming chat UI, a Node.js/Express server with an agentic tool loop, and a shared tool-definition library.

## What the starter includes

| Package           | Stack                                               | Role                                                       |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| `packages/server` | Node.js, Express, Anthropic SDK, Zod                | Agentic loop — handles chat requests, executes tools       |
| `packages/ui`     | React 19, Vercel AI SDK (`useChat`), Tailwind CSS 4 | Streaming chat UI with tool invocation cards               |
| `packages/tools`  | TypeScript, Zod                                     | Shared tool definitions (MCP, LangGraph, Express adapters) |
| `packages/app`    | Vite, React                                         | Vite dev server that hosts the UI                          |

**Key capabilities:**

- Streaming chat powered by Anthropic's Claude (configurable to OpenAI or Google)
- Server-side agentic loop: detects `tool_use` blocks, executes tools, feeds results back, repeats until `end_turn`
- `defineSharedTool` pattern: write a tool once, deploy to MCP, LangGraph, or Express without rewriting
- Session persistence via Zustand store
- Slash command support via `useSlashCommands` hook
- Customizable tool result renderer cards

## Scaffold the project

**Via CLI:**

```bash
npx create-protolab
# Select: ai-agent-app
# Enter project name when prompted
```

After scaffolding, the CLI substitutes your project name into all `package.json` files:

```bash
cd <your-project-name>
npm install        # installs all three packages from monorepo root
npm run dev        # starts server (port 3001) and UI (port 5173) concurrently
```

Open `http://localhost:5173` to see the chat UI.

> The AI agent app starter is a monorepo. Run `npm install` from the root directory — not inside individual packages.

## Set up environment variables

Create `.env` in the root directory:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

The server reads this at startup. To use OpenAI or Google instead, see [Switch model provider](#switch-model-provider).

## Add a tool

Tools are defined in `packages/tools/src/` using `defineSharedTool`:

```typescript
// packages/tools/src/tools/get-weather.ts
import { defineSharedTool } from '../define-shared-tool.js';
import { z } from 'zod';

export const getWeatherTool = defineSharedTool({
  name: 'get_weather',
  description: 'Get the current weather for a location.',
  inputSchema: z.object({
    location: z.string().describe('City name or zip code'),
  }),
  execute: async ({ location }) => {
    // Call a weather API here
    return { temperature: 72, condition: 'sunny', location };
  },
  examples: [{ input: { location: 'San Francisco' } }],
});
```

Register the tool in `packages/server/src/tools/index.ts`:

```typescript
import { getWeatherTool } from '@@PROJECT_NAME-tools';

export const tools = [getWeatherTool];
```

The server's agentic loop automatically discovers and executes registered tools when Claude requests them.

## Customize tool result cards

The UI renders tool invocations and results with `ToolInvocationPart`. To add a custom card for your tool, register a renderer in `packages/app/src/tool-registry.ts`:

```typescript
import { ToolResultRegistry } from '@@PROJECT_NAME-ui';

export const registry = new ToolResultRegistry();

registry.register('get_weather', ({ result }) => (
  <div className="weather-card">
    <span>{result.temperature}°F</span>
    <span>{result.condition}</span>
  </div>
));
```

Tools without a registered renderer fall back to a JSON display card.

## Switch model provider

The server supports Anthropic, OpenAI, and Google. Edit `packages/server/src/model-resolver.ts` to change the active provider:

```typescript
// Use OpenAI
export const defaultModel = 'gpt-4o';

// Use Google
export const defaultModel = 'gemini-2.0-flash';
```

Add the corresponding API key to `.env`:

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Google
GOOGLE_GENERATIVE_AI_API_KEY=...
```

Provider clients are lazy singletons — they instantiate on first use. If a key is missing, the server returns an error only when that provider is requested.

## Add slash commands

The UI's `useSlashCommands` hook intercepts `/` prefixes in the chat input and shows an autocomplete menu. Register commands in `packages/app/src/commands.ts`:

```typescript
export const commands = [
  {
    name: 'summarize',
    description: 'Summarize the conversation so far',
    prompt: 'Please summarize our conversation so far in 3 bullet points.',
  },
  {
    name: 'reset',
    description: 'Start a new conversation',
    action: () => window.location.reload(),
  },
];
```

Commands with a `prompt` field send the prompt as the next user message. Commands with an `action` field run the function directly.

## Customize the theme

Design tokens are CSS custom properties in `packages/ui/src/styles/tokens.css`. The `@theme inline` block bridges them to Tailwind utilities:

```css
/* packages/ui/src/styles/tokens.css */
:root {
  --primary: #6366f1;
  --background: #09090b;
  --surface: #111113;
  --text: #fafafa;
  --muted: #71717a;
  --border: #27272a;
}

@theme inline {
  --color-primary: var(--primary);
  --color-background: var(--background);
  /* ... */
}
```

Change the six values to rebrand the entire UI. Tailwind utilities like `bg-primary`, `text-muted`, and `border-border` all derive from these properties.

## Project structure

```
<your-project-name>/
├── packages/
│   ├── server/          # Express server + agentic loop
│   │   └── src/
│   │       ├── index.ts         # Server entry point
│   │       ├── routes/chat.ts   # POST /chat handler
│   │       ├── model-resolver.ts
│   │       └── tools/index.ts   # Tool registry
│   ├── ui/              # Shared React components
│   │   └── src/
│   │       ├── atoms/           # Button, Input, etc.
│   │       ├── chat/            # ChatInput, MessageList, ToolInvocationPart
│   │       └── styles/tokens.css
│   ├── tools/           # Shared tool definitions
│   │   └── src/
│   │       ├── define-shared-tool.ts
│   │       ├── adapters/        # toMCPTool, toLangGraphTool, toExpressRouter
│   │       └── tools/           # Individual tool files
│   └── app/             # Vite app shell
│       └── src/
│           ├── App.tsx
│           ├── commands.ts
│           └── tool-registry.ts
├── package.json         # Workspace root
└── .env                 # API keys (not committed)
```

## Deploy

Each package builds independently:

```bash
npm run build    # builds all packages
```

**Server:** Deploy `packages/server/dist/` as a Node.js service. Set the `PORT`, `ANTHROPIC_API_KEY`, and any other provider keys as environment variables.

**UI:** Deploy `packages/app/dist/` as a static site to Cloudflare Pages, Vercel, or any CDN. Configure the `VITE_SERVER_URL` environment variable to point at your deployed server.

## How AI agents interact with this starter

When an agent works on a feature in this project, protoLabs loads `.automaker/CONTEXT.md` into the agent's system prompt. The file explains the monorepo structure, the `defineSharedTool` API, how to add tools, and the CSS token conventions.

You can extend `.automaker/CONTEXT.md` and `.automaker/coding-rules.md` with project-specific rules. See [Context Files](../guides/context-files) for the full format.

## Next steps

- [Authoring Skills](../guides/authoring-skills) — teach agents project-specific patterns
- [Context Files](../guides/context-files) — add project rules to agent prompts
- [Architecture: how the template system works](./architecture)
