# Agent architecture

This page explains how the starter kit's packages fit together and how data flows from a user message to a streamed response.

## Package layout

The starter kit is a monorepo with eight packages, each with a distinct responsibility:

```
packages/
├── app/        React frontend — routing, pages, session management
├── ui/         Component library — ChatMessage, ChatInput, ChainOfThought
├── server/     Express API — chat endpoint, model routing, tool execution
├── tools/      Tool definitions — auto-adapts to MCP, LangGraph, and Express
├── flows/      LangGraph utilities — graph builders, routers, reducers
├── mcp/        MCP server — exposes tools to Claude Code and Claude Desktop
├── tracing/    Observability — Langfuse or local file traces
└── prompts/    Prompt registry — git-versioned templates with variable substitution
```

Packages are layered intentionally. `tools` and `flows` have no runtime dependencies on the rest of the stack, so they can be extracted into standalone agents or used inside LangGraph without importing the HTTP server.

## Request lifecycle

A typical chat request moves through three layers:

```
Browser → packages/app
  → POST /api/chat → packages/server
    → streamText() → LLM provider
    → tool calls → packages/tools
  → text/event-stream → packages/app → packages/ui components
  → trace captured → packages/tracing
```

### Step 1: User types a message

`packages/app` uses the `useChat` hook from the Vercel AI SDK. The hook sends a `POST /api/chat` request with the conversation history.

```typescript
// packages/app/src/routes/index.tsx
const { messages, input, handleSubmit } = useChat({
  api: '/api/chat',
  body: { model, system },
});
```

### Step 2: Server resolves the model

`packages/server/src/model-resolver.ts` maps the model parameter to an SDK client. The model can be:

- An alias (`haiku`, `sonnet`, `opus`, `gpt-4o`, `gemini-2.0-flash`)
- A full model ID (`claude-opus-4-5`, `gpt-4o-2024-08-06`)
- The `MODEL` environment variable (used as a default)

```typescript
// Alias resolution
'haiku'   → anthropic('claude-haiku-4-5')
'sonnet'  → anthropic('claude-sonnet-4-5')
'gpt-4o'  → openai('gpt-4o')
```

Provider clients are lazy singletons — they're created on first use and reused for subsequent requests.

### Step 3: streamText runs the agentic loop

The chat route calls `streamText()` from the Vercel AI SDK:

```typescript
const result = streamText({
  model: resolvedModel,
  messages,
  tools: getAnthropicToolsForProfile('chat'),
  maxSteps: 5, // agentic loop iterations
  system,
});
```

`maxSteps` controls how many tool call + response cycles the model can run before the loop ends. Each cycle is a "step". The UI displays each step as it arrives.

### Step 4: Tool calls execute server-side

When the model emits a `tool_use` block, the SDK calls the corresponding tool function registered in `ToolRegistry`. Results stream back to the model in the next step.

```typescript
// Tool execution is automatic — just register the tool
registry.register(myTool);
```

Tools run on the server. The browser never sees tool implementation details.

### Step 5: Response streams to the browser

`createUIMessageStream()` transforms the raw inference stream into a format the `useChat` hook understands. The browser receives tokens, tool call events, and step metadata in real time.

### Step 6: Trace is captured

After the stream completes, the server writes a trace record containing:

- Model ID and provider
- All messages (including tool calls and results)
- Token usage (input, output, total)
- Total latency in milliseconds

The trace goes to Langfuse if configured, or to a local `.traces/` file otherwise.

## Tool system

Tools follow a define-once pattern. You write one tool definition using `defineSharedTool`, then use adapters to deploy it anywhere:

```
defineSharedTool
    ├── toMCPTools()       → Claude Code / Claude Desktop
    ├── toLangGraphTools() → LangGraph agent nodes
    └── toExpressRouter()  → REST endpoints
```

This means a tool you write for the chat agent can be exposed to Claude Code via MCP without any changes.

See [Creating tools](../guides/creating-tools.md) for the full workflow.

## Multi-provider support

The server supports three LLM providers simultaneously. Set whichever API keys you have:

```bash
ANTHROPIC_API_KEY=sk-ant-...   # Enables claude-* models
OPENAI_API_KEY=sk-...          # Enables gpt-* models
GOOGLE_API_KEY=AIza...         # Enables gemini-* models
```

The model resolver detects which provider to use from the model ID prefix. If a provider's key is missing, that provider's models are unavailable at runtime.

## Component library

`packages/ui` exports a set of React components for building chat UIs:

| Component            | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `ChatMessage`        | Renders a single message with role, content, and actions |
| `ChatMessageList`    | Full conversation thread with branching support          |
| `ChatInput`          | Text input with slash command autocomplete               |
| `ChainOfThought`     | Expandable extended thinking panel                       |
| `ToolInvocationPart` | Tool call + result display                               |
| `ReasoningPart`      | Model reasoning display                                  |
| `TaskBlock`          | Multi-step task progress visualization                   |
| `ConfirmationCard`   | User approval gate for dangerous tools                   |

All components use CSS custom properties for theming. Change 6 variables in `packages/app/src/styles/tokens.css` to rebrand the entire UI.

## Observability

The `packages/tracing` package exposes a `createTracingConfig()` factory that auto-selects a backend:

```typescript
// packages/server/src/tracing/index.ts
const tracingConfig = createTracingConfig();
// → LangfuseClient if LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY are set
// → FileTracer otherwise (writes to .traces/*.json)
```

The file tracer stores one JSON file per trace and keeps the last 100 in memory for the trace viewer endpoint.

## Flow builder

`packages/flows` provides graph construction utilities on top of LangGraph:

- **Graph builders**: `createLinearGraph`, `createLoopGraph`, `createBranchingGraph`
- **Routers**: `createBinaryRouter`, `createValueRouter`, `createSequentialRouter`
- **Reducers**: `appendReducer`, `counterReducer`, `mapMergeReducer`, `idDedupAppendReducer`
- **State utilities**: `createStateAnnotation`, `validateState`, `mergeState`

The visual flow builder in `packages/app/src/routes/flows.tsx` lets you drag-drop nodes and export the result as TypeScript LangGraph code.

See [Building flows](../guides/building-flows.md) for usage.
