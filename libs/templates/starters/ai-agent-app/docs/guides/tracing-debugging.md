# Tracing and debugging

This guide shows you how to capture, view, and analyze agent behavior using the built-in tracing system.

## How tracing works

Every call to `POST /api/chat` produces a trace. After the response stream completes, the server writes a trace record containing:

- Model ID and provider
- Full conversation (including tool calls and results)
- Token usage (input, output, total)
- Estimated cost
- Total latency in milliseconds

The tracing package auto-selects a backend based on environment variables:

```
LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY set → Langfuse (remote tracing)
Otherwise                                       → FileTracer (local .traces/*.json)
```

You don't need to configure anything. Traces are captured automatically from the first request.

## View traces in the UI

Navigate to [http://localhost:5173/traces](http://localhost:5173/traces) in the running app.

The trace viewer shows:

| Column  | Description                           |
| ------- | ------------------------------------- |
| Time    | When the conversation started         |
| Model   | Which model handled the request       |
| Steps   | How many agentic loop iterations ran  |
| Tokens  | Input + output token count            |
| Cost    | Estimated cost based on model pricing |
| Latency | End-to-end response time              |

Click any row to expand the full conversation including tool calls and intermediate steps.

## Local file traces

Without Langfuse, traces are written to `.traces/` in `packages/server`:

```
packages/server/.traces/
├── trace-2024-01-15T10-30-00-000Z.json
├── trace-2024-01-15T10-31-42-000Z.json
└── ...
```

Each file is a JSON record:

```json
{
  "id": "trace-2024-01-15T10-30-00-000Z",
  "model": "claude-sonnet-4-5",
  "messages": [
    { "role": "user", "content": "What is the capital of France?" },
    { "role": "assistant", "content": "Paris." }
  ],
  "usage": {
    "inputTokens": 15,
    "outputTokens": 3,
    "totalTokens": 18
  },
  "latencyMs": 842,
  "estimatedCostUsd": 0.000021,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

The server keeps the last 100 traces in memory for the `/api/traces` endpoint. Older traces are on disk indefinitely.

## Use Langfuse for production tracing

Langfuse provides persistent storage, search, team sharing, and prompt management.

See [Langfuse integration](../integrations/langfuse.md) for the full setup.

## Add custom spans to your code

Wrap any operation in a span to capture its timing and metadata:

```typescript
import { createTracingContext, completeTracingContext } from '@@PROJECT_NAME-tracing';

async function processDocument(doc: Document) {
  const ctx = createTracingContext({
    name: 'process-document',
    metadata: { docId: doc.id, size: doc.content.length },
  });

  try {
    const result = await heavyOperation(doc);
    completeTracingContext(ctx, { success: true, outputSize: result.length });
    return result;
  } catch (err) {
    completeTracingContext(ctx, { success: false, error: String(err) });
    throw err;
  }
}
```

## Trace LLM calls directly

To trace an LLM call that happens outside the chat endpoint, use `wrapProviderWithTracing`:

```typescript
import { wrapProviderWithTracing } from '@@PROJECT_NAME-tracing';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const tracedClient = wrapProviderWithTracing(client, {
  name: 'my-flow-llm-call',
  metadata: { flow: 'research-pipeline' },
});

// Use tracedClient exactly like the original
const response = await tracedClient.messages.create({
  /* ... */
});
```

## Debug tool calls

### See what the model called

Every tool invocation appears in the trace under `messages`. The tool use and result are stored as separate message items:

```json
{ "role": "assistant", "content": [
  { "type": "tool_use", "id": "tool_001", "name": "search_docs", "input": { "query": "LangGraph" } }
]},
{ "role": "tool", "content": [
  { "type": "tool_result", "tool_use_id": "tool_001", "content": "..." }
]}
```

### Check tool progress

If a tool emits progress events, they appear in the UI as live status labels above the tool card. If you don't see them:

1. Verify the WebSocket server started on port 3002 — look for `WebSocket server running on port 3002` in the server log
2. Check browser console for WebSocket connection errors
3. Confirm your tool calls `toolProgress.emit()` with the correct `toolName`

### Common tool errors

**Tool not found**: The model tried to call a tool that isn't registered. Check that `registry.register(myTool)` runs before any requests.

**Schema validation failure**: The model passed an argument that doesn't match `inputSchema`. Check the Zod schema and the tool's description — the description is what the model reads to understand what arguments to pass.

**Tool returned `success: false`**: The tool's `execute` function caught an error and returned it. The model receives the `error` string and typically tries to recover or explain the failure.

## Debug streaming issues

If responses appear in chunks or stop mid-stream:

**Server logs**: The server logs every incoming request. Add `console.log` to your route handler to verify the request arrives.

**Network tab**: Open browser DevTools → Network → find the `/api/chat` request → click it → Response tab. You'll see the raw event stream.

**Verify model key**: A 401 from the provider shows up as an error in the stream. Check that the correct API key environment variable is set.

## Debug the agentic loop

If the agent calls the wrong tools or gets stuck in a loop:

**Check `maxSteps`**: The chat endpoint defaults to 5 steps. If your task needs more tool calls, pass `maxSteps: 10` in the request body.

**Check the system prompt**: The system prompt defines what tools the model should use and when. Be explicit: "Use the `search_docs` tool whenever you need documentation references."

**Inspect the full trace**: The trace viewer shows every message in the conversation, including all tool calls and results. Look for where the model started making incorrect decisions.

## Environment variable reference

| Variable              | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| `TRACES_DIR`          | Override the `.traces/` directory path                    |
| `LANGFUSE_PUBLIC_KEY` | Enable Langfuse tracing                                   |
| `LANGFUSE_SECRET_KEY` | Enable Langfuse tracing                                   |
| `LANGFUSE_HOST`       | Langfuse endpoint (default: `https://cloud.langfuse.com`) |
| `LOG_LEVEL`           | Server log verbosity (`debug`, `info`, `warn`, `error`)   |
