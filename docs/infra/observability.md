# Observability

protoLabs Studio ships two complementary OTel integrations for production tracing:

| Integration                     | File                    | What it captures                                                            |
| ------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| **OTLP + Auto-instrumentation** | `src/lib/otel.ts`       | Express HTTP spans, pg queries, fs operations — all standard server traffic |
| **Langfuse Span Processor**     | `src/lib/otel-setup.ts` | AI SDK calls (`streamText`, `generateText`) via `experimental_telemetry`    |

Both exporters send to Langfuse and share the same credentials.

For self-hosted local observability, see [Local OTel Stack](#local-otel-stack-grafana-alloy) below.

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
  -> gracefulShutdown()
    -> shutdownLangfuse()   // flushes Langfuse client queue
    -> shutdownOTEL()       // flushes AI SDK span processor (otel-setup.ts)
    -> shutdownOtel()       // flushes OTLP batch processor (otel.ts)
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

## Local OTel Stack (Grafana Alloy)

For local development and self-hosted deployments, protoLabs Studio provides a complete OTel pipeline via `docker-compose.observability.yml`.

### Architecture

```
protoLabs Server
  |
  | OTLP gRPC :4317 / HTTP :4318
  v
+------------------+
|  Grafana Alloy   |  (OTel Collector)
+------------------+
  |         |         |
  | traces  | metrics | logs
  v         v         v
+-------+ +-------+ +-------+
| Tempo | | Mimir | |  Loki |
+-------+ +-------+ +-------+
  |         |         |
  +---------+---------+
            |
            v
       +----------+
       |  Grafana  |  :3011
       +----------+
```

**Services:**

| Service       | Image                    | Port              | Purpose                                            |
| ------------- | ------------------------ | ----------------- | -------------------------------------------------- |
| Grafana Alloy | `grafana/alloy:latest`   | 4317, 4318, 12345 | OTel Collector — receives OTLP, routes to backends |
| Tempo         | `grafana/tempo:latest`   | 3200              | Distributed trace storage                          |
| Loki          | `grafana/loki:3.2.0`     | 3100              | Log aggregation                                    |
| Mimir         | `grafana/mimir:latest`   | 9009              | Long-term metrics storage                          |
| Grafana       | `grafana/grafana:latest` | 3011              | Dashboards and visualization                       |

### Quick Start

```bash
# Start all five services
docker compose -f docker-compose.observability.yml up -d

# Verify all services are healthy
docker compose -f docker-compose.observability.yml ps

# Open Grafana (admin / admin)
open http://localhost:3011

# Tail Alloy logs to confirm data is flowing
docker logs -f automaker-alloy
```

### Pointing the Server at Alloy

Set these environment variables before starting the protoLabs server:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=protolabs-server
```

Alloy accepts both gRPC (`:4317`) and HTTP (`:4318`). The server's `otel.ts` uses HTTP by default; either endpoint works.

### Grafana Datasources

Three datasources are pre-provisioned at startup (no manual configuration required):

| Name  | UID   | URL                            | Default |
| ----- | ----- | ------------------------------ | ------- |
| Mimir | mimir | `http://mimir:9009/prometheus` | Yes     |
| Tempo | tempo | `http://tempo:3200`            | No      |
| Loki  | loki  | `http://loki:3100`             | No      |

Tempo is linked to Mimir for service graph metrics, and to Loki for log correlation via `trace_id`.

### Dashboard: protoLabs Studio — Automation Pipeline

The pre-provisioned dashboard (`observability/grafana/dashboards/protolabs.json`) provides:

| Panel                      | Metric source                                       | Description                               |
| -------------------------- | --------------------------------------------------- | ----------------------------------------- |
| Automation Run Count       | `traces_spanmetrics_calls_total`                    | Total automation/feature span invocations |
| p50 Duration               | `traces_spanmetrics_latency_bucket` (p50)           | Median automation duration in ms          |
| p95 Duration               | `traces_spanmetrics_latency_bucket` (p95)           | 95th percentile automation duration in ms |
| Overall Error Rate         | `traces_spanmetrics_calls_total` (error ratio)      | Fraction of spans with error status       |
| Automation Run Rate by ID  | `traces_spanmetrics_calls_total` by `automation_id` | Per-automation throughput over time       |
| Error Rate by automationId | error ratio by `automation_id`                      | Per-automation error rate over time       |
| p50/p95 Duration by ID     | latency histograms by `automation_id`               | Per-automation latency percentiles        |
| Active Flows Heatmap       | `traces_spanmetrics_calls_total` by `span_name`     | Heatmap of concurrent flow activity       |

Metrics are generated by Tempo's `metrics_generator` (span metrics and service graph processors) and written to Mimir via remote write.

### Configuration Files

| File                                              | Purpose                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `observability/alloy-config.alloy`                | Alloy River config — OTLP receivers, batch processors, exporters |
| `observability/grafana/datasources.yml`           | Grafana datasource provisioning (Tempo, Loki, Mimir)             |
| `observability/grafana/dashboards/dashboards.yml` | Grafana dashboard provider config                                |
| `observability/grafana/dashboards/protolabs.json` | Automation pipeline dashboard definition                         |

### Stopping the Stack

```bash
docker compose -f docker-compose.observability.yml down

# Remove all persistent volumes (clears all stored data)
docker compose -f docker-compose.observability.yml down -v
```
