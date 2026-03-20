# Observability Package

`@protolabsai/observability` provides Langfuse-based tracing and cost tracking for LLM operations. All tracing is transparent — application code works identically whether Langfuse is available or not.

**Owner:** Infrastructure agent (agent infra domain)

## Package Structure

```
libs/observability/src/
├── langfuse/
│   ├── client.ts       # LangfuseClient wrapper with graceful fallback
│   ├── executor.ts     # executeTrackedPrompt() — prompt execution with tracing
│   ├── types.ts        # Type definitions (configs, options, results)
│   ├── versioning.ts   # Prompt version pinning and fetching
│   ├── cache.ts        # PromptCache with TTL-based local caching
│   └── middleware.ts   # wrapProviderWithTracing() — transparent generator tracing
└── index.ts
```

## LangfuseClient

Wrapper around the Langfuse SDK that provides graceful fallback when Langfuse is unavailable. All methods are safe to call regardless of connection state.

```typescript
import { LangfuseClient } from '@protolabsai/observability';

const client = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: 'https://cloud.langfuse.com',
  enabled: true,
  flushAt: 1, // Events before auto-flush (default: 1)
  flushInterval: 1000, // Auto-flush interval ms (default: 1000)
});

// Check availability
if (client.isAvailable()) {
  // Langfuse is connected
}
```

### Client Methods

| Method                      | Returns                                      | Description                    |
| --------------------------- | -------------------------------------------- | ------------------------------ |
| `isAvailable()`             | `boolean`                                    | Check if connected and enabled |
| `getPrompt(name, version?)` | `Promise<{prompt, version, config} \| null>` | Fetch a prompt                 |
| `createTrace(options)`      | Trace or `null`                              | Create a trace                 |
| `createGeneration(options)` | Generation or `null`                         | Log an LLM generation          |
| `createSpan(options)`       | Span or `null`                               | Log a span within a trace      |
| `createScore(options)`      | `void`                                       | Score a trace                  |
| `flush()`                   | `Promise<void>`                              | Flush pending events           |
| `shutdown()`                | `Promise<void>`                              | Flush and disconnect           |

All methods return `null` or silently no-op when Langfuse is unavailable.

## Tracing Middleware

`wrapProviderWithTracing()` transparently adds Langfuse tracing to any async generator. The application code doesn't change.

```typescript
import { wrapProviderWithTracing } from '@protolabsai/observability';
import type { TracingConfig } from '@protolabsai/observability';

const tracingConfig: TracingConfig = {
  enabled: true,
  client: langfuseClient,
  defaultTags: ['production'],
  defaultMetadata: { service: 'automaker' },
  pricing: {
    'opus-4-6': { input: 15, output: 75 },
    'sonnet-4-5': { input: 3, output: 15 },
    'haiku-4-5': { input: 0.8, output: 4 },
  },
};

// Wrap any async generator with tracing
const tracedGenerator = wrapProviderWithTracing(myProvider.invoke(prompt), tracingConfig, {
  model: 'claude-sonnet-4-5',
  traceName: 'feature-implementation',
  sessionId: 'session-123',
  tags: ['auto-mode'],
});

// Use exactly like the original generator
for await (const message of tracedGenerator) {
  process.stdout.write(message.content);
}
// Trace + generation automatically logged to Langfuse
```

### What Gets Tracked

- **Trace** — Top-level container with name, user, session, tags
- **Generation** — LLM call details: model, input, output, tokens, latency
- **Cost** — Calculated from token usage and configurable pricing (per 1M tokens)
- **Errors** — Captured with stack traces, attached to the generation

### Configurable Pricing

Override default pricing per model:

```typescript
const config: TracingConfig = {
  pricing: {
    'my-custom-model': { input: 5, output: 25 }, // per 1M tokens
  },
};
```

Default pricing is included for Claude models (opus, sonnet, haiku).

## Manual Tracing

For cases where the middleware pattern doesn't fit:

```typescript
import { createTracingContext, completeTracingContext } from '@protolabsai/observability';

// Start a trace
const ctx = createTracingContext(client, {
  traceName: 'manual-operation',
  sessionId: 'session-456',
  tags: ['batch'],
});

// ... do work ...

// Complete the trace with results
await completeTracingContext(client, ctx, {
  model: 'claude-sonnet-4-5',
  input: 'prompt text',
  output: 'completion text',
  usage: { promptTokens: 500, completionTokens: 1200, totalTokens: 1700 },
});
```

## Type Reference

### Configuration Types

```typescript
interface LangfuseConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  enabled?: boolean;
  flushAt?: number;
  flushInterval?: number;
}

interface TracingConfig {
  enabled: boolean;
  client?: LangfuseClient;
  defaultTags?: string[];
  defaultMetadata?: Record<string, any>;
  pricing?: Record<string, { input: number; output: number }>;
}

interface PromptVersionConfig {
  promptName: string;
  version?: number;
  label?: string;
}
```

### Operation Types

```typescript
interface CreateTraceOptions {
  id?: string;
  name?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

interface CreateGenerationOptions {
  id?: string;
  traceId: string;
  name?: string;
  model?: string;
  modelParameters?: { temperature?: number; maxTokens?: number; [key: string]: any };
  input?: any;
  output?: any;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  metadata?: Record<string, any>;
  startTime?: Date;
  endTime?: Date;
}

interface CreateSpanOptions {
  id?: string;
  traceId: string;
  name?: string;
  input?: any;
  output?: any;
  metadata?: Record<string, any>;
  startTime?: Date;
  endTime?: Date;
}

interface CreateScoreOptions {
  traceId: string;
  name: string;
  value: number;
  comment?: string;
}
```

## Project Lifecycle Tracing

When an LLM call originates from a project lifecycle phase (research, PRD generation, agent execution, deploy verification), the trace is tagged with project and phase context. This groups all traces under a single Langfuse session, enabling end-to-end cost and timeline visibility.

### How It Works

Pass `projectSlug` and `phase` in the `traceContext` option of `simpleQuery()` or `streamingQuery()`:

```typescript
const result = await streamingQuery({
  prompt,
  model: RESEARCH_MODEL,
  cwd: projectPath,
  traceContext: {
    projectSlug: 'ci-reaction-engine',
    phase: 'research',
    agentRole: 'researcher',
  },
});
```

For direct provider usage (e.g., `ExecutionService.runAgent`), call `setContext()` on the `TracedProvider`:

```typescript
if (provider instanceof TracedProvider) {
  provider.setContext({
    featureId,
    featureName: feature.title,
    agentRole: 'engineer',
    projectSlug: feature.projectSlug,
    phase: 'execute',
  });
}
```

### What Happens

- `projectSlug` sets `sessionId` to `project:{slug}` and adds a `project:{slug}` tag
- `phase` adds a `phase:{phase}` tag
- Both values are stored in `defaultMetadata` for the trace
- Features without `projectSlug` fall back to the existing `sdkSessionId` behavior

### Viewing in Langfuse

Filter the Sessions tab by `project:{slug}` to see all lifecycle phases grouped together with cumulative cost.

### Phase Values

| Phase      | Source                               |
| ---------- | ------------------------------------ |
| `research` | `ProjectLifecycleService.research()` |
| `prd`      | `generate-prd` route handler         |
| `execute`  | `ExecutionService.runAgent()`        |
| `deploy`   | `DeployProcessor` (reflection, goal) |

## Known Gotchas

- **Langfuse SDK types lag runtime API** — `getPrompt()` accepts 3 args at runtime but TS types only declare 2. Use `(client as any).getPrompt()` for the label overload. Same for `score()`.
- **Cost calculation requires model name substring match** — The pricing key is matched via `modelName.includes(key)`. Use short, unique substrings as keys.
- **Flush is async** — Always `await client.flush()` before process exit or you'll lose events.

## Dependencies

```
langfuse       # Langfuse SDK
zod            # Schema validation (for PromptConfigSchema)
@protolabsai/utils  # Logging
```
