# Observability

protoLabs Studio ships two complementary OTel integrations for production tracing:

| Integration                     | File                    | What it captures                                                            |
| ------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| **OTLP + Auto-instrumentation** | `src/lib/otel.ts`       | Express HTTP spans, pg queries, fs operations — all standard server traffic |
| **Langfuse Span Processor**     | `src/lib/otel-setup.ts` | AI SDK calls (`streamText`, `generateText`) via `experimental_telemetry`    |

Both exporters send to Langfuse and share the same credentials.

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

## OTLP HTTP Exporter (`otel.ts`)

Called as the first operation in `runStartup()`. Configures NodeSDK with:

- **Exporter**: `OTLPTraceExporter` pointing to `${LANGFUSE_BASE_URL}/api/public/otel`
  (the exporter auto-appends `/v1/traces` to the base URL)
- **Auth**: HTTP `Authorization: Basic <base64(publicKey:secretKey)>` header
- **Instrumentation**: `getNodeAutoInstrumentations()` — covers Express HTTP, pg, fs, and other common Node.js modules

### No-op behavior

If `LANGFUSE_PUBLIC_KEY` or `LANGFUSE_SECRET_KEY` are missing, `initOtel()` logs a single info line and returns without registering the SDK. No error is thrown.

## AI SDK Telemetry (`otel-setup.ts`)

Initialized separately during the same startup sequence. Uses `LangfuseSpanProcessor` from `@langfuse/otel` to capture AI SDK spans when `experimental_telemetry: { isEnabled: true }` is passed to `streamText` / `generateText` calls.

Example:

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

Langfuse shows both OTLP HTTP spans (from `otel.ts`) and AI SDK spans (from `otel-setup.ts`) in the same project — they share credentials and will appear together in the traces list.

## Graceful Shutdown

Both SDKs are flushed during graceful shutdown (`shutdown.ts`):

```
SIGTERM / SIGINT
  → gracefulShutdown()
    → shutdownLangfuse()   // flushes Langfuse client queue
    → shutdownOTEL()       // flushes AI SDK span processor (otel-setup.ts)
    → shutdownOtel()       // flushes OTLP batch processor (otel.ts)
    → server.close()
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
