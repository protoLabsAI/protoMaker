# Observability

protoLabs Studio uses a single unified OTel NodeSDK with two span processors:

| Processor                 | What it captures                                                            |
| ------------------------- | --------------------------------------------------------------------------- |
| **BatchSpanProcessor**    | Express HTTP spans, pg queries, fs operations — all standard server traffic |
| **LangfuseSpanProcessor** | AI SDK calls (`streamText`, `generateText`) via `experimental_telemetry`    |

Both processors live in one `NodeSDK` instance (`src/lib/otel.ts`) and share the same Langfuse credentials. Agent execution is additionally traced via `TracedProvider` (Langfuse SDK) and Claude subprocess telemetry (`CLAUDE_CODE_ENABLE_TELEMETRY`).

For local development tracing, point `LANGFUSE_BASE_URL` at a self-hosted Langfuse instance started via `docker-compose.infra.yml`.

## Configuration

Set these environment variables to enable tracing:

| Variable              | Required | Default                      | Description                                                                    |
| --------------------- | -------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `LANGFUSE_PUBLIC_KEY` | Yes      | —                            | Langfuse project public key. Both integrations are disabled if this is absent. |
| `LANGFUSE_SECRET_KEY` | Yes      | —                            | Langfuse project secret key.                                                   |
| `LANGFUSE_BASE_URL`   | No       | `https://cloud.langfuse.com` | Override for self-hosted Langfuse.                                             |
| `OTEL_SERVICE_NAME`   | No       | `protolabs-server`           | Service name that appears in Langfuse trace metadata.                          |

The staging `docker-compose.staging.yml` maps all four from the host environment with safe defaults:

```yaml
- LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY:-}
- LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY:-}
- LANGFUSE_BASE_URL=${LANGFUSE_BASE_URL:-}
- OTEL_SERVICE_NAME=${OTEL_SERVICE_NAME:-protolabs-server}
```

## Unified OTel SDK (`otel.ts`)

Called as the first operation in `runStartup()`. Configures a single `NodeSDK` with:

- **BatchSpanProcessor** + `OTLPTraceExporter` pointing to `${LANGFUSE_BASE_URL}/api/public/otel/v1/traces` (full URL required — `OTLPTraceExporter` only auto-appends `/v1/traces` when using `OTEL_EXPORTER_OTLP_ENDPOINT` env var, not the programmatic `url` option)
- **LangfuseSpanProcessor** from `@langfuse/otel` — captures AI SDK `experimental_telemetry` spans with enriched LLM metadata (model, tokens, cost)
- **Auth**: HTTP `Authorization: Basic <base64(publicKey:secretKey)>` header
- **Instrumentation**: `getNodeAutoInstrumentations()` — covers Express HTTP, pg, fs, and other common Node.js modules

Only one `NodeSDK` can register the global TracerProvider per process. Using two separate `NodeSDK` instances causes the second to silently no-op. Both processors are registered in a single SDK to ensure both are active.

### No-op behavior

If `LANGFUSE_PUBLIC_KEY` or `LANGFUSE_SECRET_KEY` are missing, `initOtel()` logs a WARN-level message and returns without registering the SDK. No error is thrown.

## Agent Tracing (Three Layers)

| Layer                      | What                                                                    | How                                                                  |
| -------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **TracedProvider**         | Top-level agent run (latency, tokens, tool spans, cost)                 | `ProviderFactory.wrapWithTracing()` wraps provider with Langfuse SDK |
| **LangfuseSpanProcessor**  | AI SDK calls (`streamText`, `generateText`) in `/api/chat`, `/api/ai/*` | `experimental_telemetry: { isEnabled: true }` on each call           |
| **Claude subprocess OTel** | Per-turn token usage, API request costs, tool result timings            | `CLAUDE_CODE_ENABLE_TELEMETRY=1` passed in subprocess env            |

The Claude Agent SDK runs as a `claude -p` subprocess. The parent process traces the message stream via TracedProvider. The subprocess emits its own OTel spans (if Langfuse credentials are configured) as separate traces, correlated by `featureId` resource attribute.

### AI SDK telemetry example

```typescript
const result = await streamText({
  model: anthropic('claude-opus-4-6'),
  prompt: 'Hello',
  experimental_telemetry: { isEnabled: true, functionId: 'my-function' },
});
```

## Viewing Traces

1. Open [Langfuse](https://cloud.langfuse.com) (or your self-hosted instance)
2. Navigate to **Traces**
3. Filter by `Service Name = protolabs-server` to isolate server traffic
4. Click any trace to inspect spans, durations, and attributes

All spans land in the same Langfuse project — OTLP HTTP spans and AI SDK spans share credentials and appear together in the traces list.

## Graceful Shutdown

The OTel SDK and Langfuse client are flushed during graceful shutdown (`shutdown.ts`):

```
SIGTERM / SIGINT
  -> gracefulShutdown()
    -> shutdownLangfuse()   // flushes Langfuse SDK client queue (TracedProvider traces)
    -> shutdownOtel()       // flushes both span processors (OTLP batch + Langfuse)
    -> server.close()
```

The shutdown sequence waits for all pending spans to be exported before closing the HTTP server.

## Adding Instrumentation to a New Service

Auto-instrumentation covers most standard Node.js I/O automatically. For custom business logic spans, use the OTel API directly:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');

async function doWork() {
  return tracer.startActiveSpan('my-operation', async (span) => {
    span.setAttribute('feature.id', featureId);
    try {
      const result = await someOperation();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
```
