# Langfuse Integration

Server-side wiring that connects [`@automaker/observability`](./observability-package.md) to the Automaker runtime. Covers the Langfuse singleton, traced provider wrapper, automatic agent scoring, API proxy routes, and MCP tools. All tracing is opt-in — the server runs identically when Langfuse credentials are absent.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  @automaker/observability (library)                     │
│  LangfuseClient · wrapProviderWithTracing               │
└────────────────────┬────────────────────────────────────┘
                     │ imported by
┌────────────────────▼────────────────────────────────────┐
│  Server Integration Layer                               │
│                                                         │
│  langfuse-singleton.ts   getLangfuseInstance()           │
│          │                                              │
│          ├──► provider-factory.ts  wrapWithTracing()     │
│          │        │                                     │
│          │        └──► TracedProvider (per agent run)    │
│          │                  setContext(feature, role)    │
│          │                                              │
│          ├──► AgentScoringService                       │
│          │        listens: feature:status-changed        │
│          │        scores: success, efficiency, quality   │
│          │                                              │
│          └──► Langfuse API proxy routes                 │
│                   /api/langfuse/*  (8 endpoints)        │
└────────────────────┬────────────────────────────────────┘
                     │ exposed via
┌────────────────────▼────────────────────────────────────┐
│  MCP Plugin (7 tools)                                   │
│  langfuse_list_traces  · langfuse_get_trace             │
│  langfuse_get_costs    · langfuse_list_prompts          │
│  langfuse_score_trace  · langfuse_add_to_dataset        │
│  langfuse_list_datasets                                 │
└─────────────────────────────────────────────────────────┘
```

## Setup

### Environment Variables

| Variable              | Required | Default                      | Description                             |
| --------------------- | -------- | ---------------------------- | --------------------------------------- |
| `LANGFUSE_PUBLIC_KEY` | No       | —                            | Langfuse public key                     |
| `LANGFUSE_SECRET_KEY` | No       | —                            | Langfuse secret key                     |
| `LANGFUSE_BASE_URL`   | No       | `https://cloud.langfuse.com` | Langfuse API URL (self-hosted or cloud) |

Set these in the project root `.env` file (`automaker/.env`). When any credential is missing, tracing is silently disabled — no errors, no performance impact.

### Verifying Setup

After setting the env vars and restarting the server, check the logs for:

```
[LangfuseSingleton] Langfuse singleton initialized (tracing enabled)
```

If credentials are missing you'll see:

```
[LangfuseSingleton] Langfuse singleton initialized (tracing disabled — missing credentials)
```

## Langfuse Singleton

**File:** `apps/server/src/lib/langfuse-singleton.ts`

A single shared `LangfuseClient` instance for the entire server process. Lazy-initialized on first access.

```typescript
import { getLangfuseInstance, shutdownLangfuse } from '../lib/langfuse-singleton.js';

// Get the shared client (creates on first call)
const langfuse = getLangfuseInstance();

// Check if tracing is actually available
if (langfuse.isAvailable()) {
  // Credentials present, tracing active
}

// Called during server graceful shutdown (flushes pending events)
await shutdownLangfuse();
```

The singleton reads `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` from `process.env`. It returns a disabled client when credentials are missing — callers should check `isAvailable()` before relying on trace data.

Shutdown is wired into the server's `SIGTERM`/`SIGINT` handler at `apps/server/src/index.ts:1561`.

## TracedProvider

**File:** `apps/server/src/providers/traced-provider.ts`

A decorator that wraps any `BaseProvider` with Langfuse tracing. Every LLM call through the provider automatically creates a trace and generation in Langfuse.

### How It Works

`ProviderFactory.getProviderForModel()` calls `wrapWithTracing()` on every provider it creates:

```typescript
// provider-factory.ts (simplified)
private static wrapWithTracing(provider: BaseProvider): BaseProvider {
  const langfuse = getLangfuseInstance();
  if (langfuse.isAvailable()) {
    return new TracedProvider(provider, {
      enabled: true,
      client: langfuse,
      defaultTags: ['automaker'],
    });
  }
  return provider; // No tracing — return as-is
}
```

When Langfuse is unavailable, the original provider is returned unchanged. No conditional logic needed in calling code.

### Setting Feature Context

After creating a provider, call `setContext()` to correlate traces with board features:

```typescript
if (provider instanceof TracedProvider) {
  provider.setContext({
    featureId: 'abc-123',
    featureName: 'Add dark mode',
    agentRole: 'backend-engineer',
  });
}
```

This adds:

- `feature:abc-123` and `role:backend-engineer` as Langfuse tags (filterable in the dashboard)
- Feature metadata to every trace created by this provider instance

### What Gets Traced

Each `executeQuery()` call creates a trace with:

| Field                                | Value                                       |
| ------------------------------------ | ------------------------------------------- |
| `name`                               | `provider:<name>` (e.g., `provider:claude`) |
| `sessionId`                          | Agent SDK session ID                        |
| `tags`                               | `['automaker']` + feature/role tags         |
| `metadata.provider`                  | Provider name                               |
| `metadata.model`                     | Resolved model ID                           |
| `metadata.maxTurns`                  | Turn limit for the agent                    |
| `metadata.conversationHistoryLength` | Prior messages count                        |

## Agent Scoring

**File:** `apps/server/src/services/agent-scoring-service.ts`

Automatically scores agent traces when feature status changes. Initialized at server startup (`apps/server/src/index.ts:420`) and listens for `feature:status-changed` events.

### Score Definitions

| Score Name         | Range   | Trigger        | Formula                                                        |
| ------------------ | ------- | -------------- | -------------------------------------------------------------- |
| `agent.success`    | 0.0–1.0 | Status change  | `1.0` (done), `0.7` (review), `0.0` (reset/blocked)            |
| `agent.efficiency` | 0.0–1.0 | Done or review | `1 - (turnsUsed / maxTurns)` — higher = fewer turns used       |
| `agent.quality`    | 0.0–1.0 | Done           | `1 - (threadCount * 0.1)` — penalizes CodeRabbit review issues |

### Scoring Rules

| Status Transition         | Scores Created                       |
| ------------------------- | ------------------------------------ |
| `in_progress` → `done`    | success (1.0) + efficiency + quality |
| `in_progress` → `review`  | success (0.7) + efficiency           |
| `in_progress` → `backlog` | success (0.0)                        |
| `in_progress` → `blocked` | success (0.0)                        |

### Correlation

Scores are attached to traces via `feature.lastTraceId`. If a feature has no `lastTraceId`, scoring is skipped silently.

### Default Max Turns by Complexity

| Complexity      | Max Turns |
| --------------- | --------- |
| `small`         | 200       |
| `medium`        | 500       |
| `large`         | 750       |
| `architectural` | 1000      |

## API Proxy Routes

**File:** `apps/server/src/routes/langfuse/index.ts`
**Mount point:** `app.use('/api/langfuse', createLangfuseRoutes())`

Eight POST endpoints that proxy to the Langfuse REST API using Basic Auth (`publicKey:secretKey`). All endpoints return `503` with `{ error: "Langfuse not configured" }` when credentials are missing.

| Endpoint                            | Langfuse API                     | Description                                       |
| ----------------------------------- | -------------------------------- | ------------------------------------------------- |
| `POST /api/langfuse/traces`         | `GET /api/public/traces`         | List traces with filters (name, tags, date range) |
| `POST /api/langfuse/traces/detail`  | `GET /api/public/traces/:id`     | Get single trace with all observations            |
| `POST /api/langfuse/costs`          | `GET /api/public/observations`   | Get generations for cost analysis                 |
| `POST /api/langfuse/prompts`        | `GET /api/public/v2/prompts`     | List managed prompts                              |
| `POST /api/langfuse/scores`         | `POST /api/public/scores`        | Create a score on a trace                         |
| `POST /api/langfuse/datasets`       | `GET /api/public/v2/datasets`    | List datasets                                     |
| `POST /api/langfuse/datasets/items` | `POST /api/public/dataset-items` | Add trace to a dataset (auto-creates dataset)     |
| `POST /api/langfuse/webhook/prompt` | —                                | Langfuse webhook receiver for prompt sync         |

All routes use POST (Express 5 convention for routes that accept body parameters) even when the underlying Langfuse API is GET.

## MCP Tools

Seven MCP tools expose the Langfuse proxy routes to Claude Code and other MCP clients.

| Tool                      | Description                                               | Required Params            |
| ------------------------- | --------------------------------------------------------- | -------------------------- |
| `langfuse_list_traces`    | List recent traces with filters                           | —                          |
| `langfuse_get_trace`      | Get full trace detail (generations, spans, scores, costs) | `traceId`                  |
| `langfuse_get_costs`      | Get observations for cost analysis                        | —                          |
| `langfuse_list_prompts`   | List managed prompts with versions/labels                 | —                          |
| `langfuse_score_trace`    | Score a trace (name, value 0–1, optional comment)         | `traceId`, `name`, `value` |
| `langfuse_list_datasets`  | List datasets with item counts                            | —                          |
| `langfuse_add_to_dataset` | Add a trace to a named dataset (creates if missing)       | `datasetName`, `traceId`   |

### Example Usage

```bash
# List recent traces tagged with a specific feature
langfuse_list_traces --tags '["feature:abc-123"]' --limit 10

# Get detailed trace info
langfuse_get_trace --traceId "trace-uuid-here"

# Manually score agent output quality
langfuse_score_trace --traceId "trace-uuid" --name "quality" --value 0.9 --comment "Clean implementation"

# Add a good trace to a training dataset
langfuse_add_to_dataset --datasetName "good-implementations" --traceId "trace-uuid"
```

## Feature Type Additions

PR #588 added two fields to the `Feature` interface (`libs/types/src/feature.ts`):

| Field            | Type                      | Description                                                                                                                       |
| ---------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `lastTraceId`    | `string?`                 | Langfuse trace ID from the most recent agent execution. Used by `AgentScoringService` to correlate scores.                        |
| `threadFeedback` | `ReviewThreadFeedback[]?` | Per-thread CodeRabbit review feedback with agent decisions. Used by quality scoring (`threadFeedback.length` determines penalty). |

## Execution Flow

Step-by-step trace of what happens during an agent run:

1. **Agent starts** — `AgentService` picks a feature from the backlog
2. **Provider created** — `ProviderFactory.getProviderForModel()` creates a Claude/Cursor/Codex provider
3. **Wrapped with tracing** — `wrapWithTracing()` checks `getLangfuseInstance().isAvailable()` and wraps the provider in `TracedProvider` if Langfuse is configured
4. **Context set** — `TracedProvider.setContext()` called with feature ID, name, and agent role — tags are added for filtering
5. **LLM calls traced** — Each `executeQuery()` call creates a Langfuse trace with generation details (model, tokens, latency, cost)
6. **Feature completes** — Status changes to `review` or `done`
7. **Auto-scored** — `AgentScoringService` receives `feature:status-changed` event, reads `feature.lastTraceId`, and creates `agent.success`, `agent.efficiency`, and `agent.quality` scores on the trace
8. **Queryable** — Traces, scores, and costs are available via MCP tools or the Langfuse dashboard

## Reflection Tracing

Per-feature reflections generated by the Lead Engineer's DeployProcessor are automatically traced in Langfuse via the `simpleQuery()` trace context injection.

### What Gets Traced

Each reflection call creates a Langfuse trace with:

| Field                  | Value                                              |
| ---------------------- | -------------------------------------------------- |
| `tags`                 | `['automaker', 'feature:{id}', 'role:reflection']` |
| `metadata.featureId`   | Feature ID                                         |
| `metadata.featureName` | Feature title                                      |
| `metadata.agentRole`   | `reflection`                                       |
| `model`                | `claude-haiku-4-5-20251001`                        |

### Filtering Reflections

```bash
# List all reflection traces
langfuse_list_traces --tags '["role:reflection"]'

# List reflections for a specific feature
langfuse_list_traces --tags '["feature:abc-123", "role:reflection"]'
```

### How It Works

1. `DeployProcessor.generateReflection()` calls `simpleQuery()` with `traceContext: { featureId, featureName, agentRole: 'reflection' }`
2. `simpleQuery()` detects `traceContext` and calls `TracedProvider.setContext()` before executing the query
3. The TracedProvider enriches the Langfuse trace with feature tags and metadata
4. The trace appears in Langfuse under the `role:reflection` tag

This uses the same `TracedProvider` path as agent execution — no separate tracing infrastructure. When Langfuse is not configured, the reflection runs identically without tracing.

## Dual-Track Tracing Architecture

Two independent tracing mechanisms coexist:

| Track           | Mechanism                                     | Covers                           | Trace Source      |
| --------------- | --------------------------------------------- | -------------------------------- | ----------------- |
| **SDK Wrapper** | `TracedProvider` + `@automaker/observability` | Agent runs (Claude Agent SDK)    | Manual SDK        |
| **OTEL**        | `@langfuse/otel` + `@opentelemetry/sdk-node`  | Chat UI (`/api/chat` via AI SDK) | Auto-instrumented |

This is intentional: agent execution uses the Claude Agent SDK (traced via `TracedProvider`), while the chat UI uses Vercel AI SDK (auto-traced via OpenTelemetry spans). The two tracks produce separate Langfuse traces with different structures but both land in the same Langfuse project.

**No double-counting risk** — agents and chat use different provider paths that don't overlap.

## Related Documentation

- [Langfuse Prompt Management](./langfuse-prompts.md) — Versioned prompt management, three-layer resolution, webhook sync
- [Observability Package](./observability-package.md) — `@automaker/observability` library reference (client, middleware, prompt versioning)
- [Providers](../server/providers.md) — AI provider architecture
