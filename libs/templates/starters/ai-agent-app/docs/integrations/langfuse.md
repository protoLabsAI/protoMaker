# Langfuse

This page covers connecting the starter kit to Langfuse for production-grade observability — persistent trace storage, team dashboards, and prompt management.

## What Langfuse provides

| Feature           | File tracer (default)      | Langfuse                     |
| ----------------- | -------------------------- | ---------------------------- |
| Trace storage     | Local `.traces/` directory | Remote cloud or self-hosted  |
| History           | Last 100 traces in memory  | Unlimited                    |
| Search and filter | None                       | Full-text + metadata filters |
| Team access       | Single machine             | Shared dashboard             |
| Prompt management | Git files                  | Versioned in Langfuse UI     |
| Alerts            | None                       | Configurable                 |

## Set up Langfuse

### 1. Create a Langfuse account

Sign up at [cloud.langfuse.com](https://cloud.langfuse.com) or run a self-hosted instance.

### 2. Create a project

In the Langfuse dashboard, create a project for your agent app. Copy the project's **public key** and **secret key**.

### 3. Set environment variables

Add to `packages/server/.env`:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

# Optional: override the default cloud endpoint
LANGFUSE_HOST=https://cloud.langfuse.com
```

### 4. Restart the server

```bash
# Stop and restart
npm run dev
```

The server logs `Langfuse tracing enabled` on startup when keys are detected. All subsequent chat requests are automatically traced to your Langfuse project.

## Verify traces are arriving

1. Open the Langfuse dashboard → Traces
2. Send a message in the chat UI
3. Refresh the Langfuse trace list — your trace should appear within a few seconds

Each trace includes:

- **Name**: `chat` (from the chat endpoint)
- **Input**: the user's messages
- **Output**: the assistant's response
- **Metadata**: model ID, token usage, latency
- **Spans**: individual tool call timings (if tools were used)

## Add custom trace metadata

To attach extra metadata to traces from your own code:

```typescript
import { createTracingContext, completeTracingContext } from '@@PROJECT_NAME-tracing';

async function runResearchPipeline(query: string) {
  const ctx = createTracingContext({
    name: 'research-pipeline',
    metadata: {
      query,
      pipelineVersion: '2.1.0',
      userId: getCurrentUserId(),
    },
  });

  const result = await doResearch(query);

  completeTracingContext(ctx, {
    success: true,
    resultCount: result.items.length,
  });

  return result;
}
```

## Trace LLM calls in flows

When running LangGraph flows or other pipelines outside the chat endpoint, wrap your LLM client:

```typescript
import { wrapProviderWithTracing } from '@@PROJECT_NAME-tracing';
import Anthropic from '@anthropic-ai/sdk';

const client = wrapProviderWithTracing(new Anthropic(), {
  name: 'research-flow-llm',
  metadata: { flow: 'research-pipeline', version: '1.0' },
});

// Use client as normal — all calls are traced
const response = await client.messages.create({
  model: 'claude-haiku-4-5',
  max_tokens: 1024,
  messages: [{ role: 'user', content: query }],
});
```

## Use Langfuse prompts (optional)

Langfuse can store and version your prompt templates. To fetch a prompt at runtime:

```typescript
import { LangfuseClient } from '@@PROJECT_NAME-tracing';

const tracer = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
});

// Fetch the latest version of a prompt
const prompt = await tracer.getPrompt('support-agent');

// Use the prompt text in your request
const result = await streamText({
  model,
  messages,
  system: prompt.text,
});
```

This lets you update prompts in the Langfuse UI without deploying code.

## Filter and search traces

In the Langfuse dashboard, filter traces by:

- **Model**: `claude-haiku-4-5`, `gpt-4o`, etc.
- **Date range**: identify regressions after a deploy
- **Token usage**: find unexpectedly expensive requests
- **Tags**: attach tags in your code for custom segmentation

```typescript
createTracingContext({
  name: 'chat',
  tags: ['production', 'premium-user'],
  metadata: { userId: '123', plan: 'pro' },
});
```

## Score traces for evaluation

Langfuse lets you attach quality scores to traces for systematic evaluation:

```typescript
// After a conversation completes:
await tracer.score({
  traceId,
  name: 'user-rating',
  value: 4, // 1-5 star rating
  comment: 'Helpful but a bit verbose',
});
```

Automate scoring with a separate evaluator agent:

```typescript
const score = await evaluatorAgent.evaluate(trace);
await tracer.score({ traceId, name: 'auto-quality', value: score });
```

## Self-hosted Langfuse

To run Langfuse on your own infrastructure, set `LANGFUSE_HOST` to your instance:

```bash
LANGFUSE_HOST=https://langfuse.my-company.com
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

The starter kit connects to any Langfuse-compatible endpoint.

## Disable tracing

Remove the Langfuse environment variables. The tracing package falls back to the local file tracer automatically — no code changes needed.

To disable all tracing:

```typescript
// packages/server/src/tracing/index.ts
// Comment out the tracing middleware
// const tracingConfig = createTracingConfig();
```
