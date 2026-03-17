# Research Report: Infrastructure as Code: Observability & Deploy Stack

Generated: 2026-03-17T07:58:47.984Z
Sub-topics investigated: 5
Total citations: 78
Models used: Haiku (compression), Sonnet (research), Opus (synthesis)

# Infrastructure as Code: Observability & Deploy Stack — Research Report

## Summary

The Automaker project suffers from fragmented infrastructure configuration: **7 root-level compose files** [1], **two conflicting observability stacks** [2][3], **three independent Grafana instances** [4][5][6], and a **broken external Langfuse dependency** [19] that silently drops LLM traces when unreachable [34]. The deploy pipeline has solid foundations — rollback tagging [40], agent drain [43][44], smoke testing [36], and resource auto-tuning [53] — but lacks compose-file linting in CI [45][46] and has environment parity gaps between staging and production [47][48].

The recommended approach consolidates everything into a single `docker-compose.infra.yml` built on the existing LGTM stack (Loki, Grafana, Tempo, Mimir) [78], retires the legacy Prometheus/Promtail monitoring stack [64][66], and replaces the broken Langfuse Cloud instance with either a self-hosted Langfuse or a lighter-weight alternative like Arize Phoenix [76][77].

---

## Codebase Findings

### 1. Compose File Proliferation

Seven compose files exist at the repository root [1]:

| File | Purpose | Key Ports |
|---|---|---|
| `docker-compose.yml` | Default dev (isolated) | UI `:3007`, Server `:3008` [7][8] |
| `docker-compose.dev.yml` | Dev with HMR, healthchecks | Same + liveness probes [32][37] |
| `docker-compose.staging.yml` | Staging with CRDT, host mounts | `:4444`/`:4445` CRDT [9][47] |
| `docker-compose.prod.yml` | Production with Docker Secrets | UI `:3000`, Grafana `:3000` [6][16] |
| `docker-compose.monitoring.yml` | Prometheus-pull stack | Prometheus `:9090`, Grafana `:3010` [4][27] |
| `docker-compose.observability.yml` | OTEL-push stack | Alloy `:4317`/`:4318`, Grafana `:3011` [5][26] |
| `docker/dev-server/docker-compose.yml` | Watchtower auto-update | GHCR pull, 5-min poll [10] |

Additionally, `docker-compose.docs.yml` exists in worktrees only, deploying via Traefik/Let's Encrypt to an external Coolify network [11].

### 2. Conflicting Observability Stacks

The two monitoring compose files define **the same container name and volume name**, making them mutually exclusive:

```yaml
# docker-compose.monitoring.yml [2]
container_name: automaker-loki
volumes:
  loki-data:
    name: automaker-loki-data

# docker-compose.observability.yml [3]
container_name: automaker-loki
volumes:
  loki-data:
    name: automaker-loki-data
```

The **monitoring stack** (`docker-compose.monitoring.yml`) runs Prometheus (pull-based scraping at 10s intervals via `host.docker.internal:3008`) [28], Promtail (Docker socket log shipping) [31], Loki, Node Exporter, and Grafana on port 3010 [27].

The **observability stack** (`docker-compose.observability.yml`) runs Alloy (OTLP gRPC/HTTP receiver), Tempo (distributed tracing), Mimir (long-term metrics), Loki, and Grafana on port 3011 [26]. It uses inline Docker `configs:` blocks for Tempo, Loki, and Mimir configuration [14].

Critically, **Promtail is deprecated** — Grafana Labs declared it "feature complete" with all future log collection moving to Alloy [72]. The monitoring stack is legacy debt.

### 3. Three Grafana Instances

```
Monitoring Grafana  → :3010 [4]
Observability Grafana → :3011 [5]
Production Grafana  → :3000 [6]
```

No shared dashboards or datasource consolidation exists across these instances. Each maintains independent provisioning.

### 4. Broken Langfuse Dependency

The live `.env` points to `https://langfuse.proto-labs.ai` [19], a self-hosted instance that is currently broken. The server's OTel setup creates **two simultaneous trace processors**, both targeting this endpoint:

```typescript
// apps/server/src/lib/otel.ts:54-67 [20][21][34]
const otlpExporter = new OTLPTraceExporter({
  url: `${baseUrl}/api/public/otel/v1/traces`,
  headers: {
    Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
  },
});

const langfuseProcessor = new LangfuseSpanProcessor({
  publicKey,
  secretKey,
  baseUrl: baseUrl || 'https://cloud.langfuse.com',
});

const sdk = new NodeSDK({
  spanProcessors: [new BatchSpanProcessor(otlpExporter as any), langfuseProcessor as any],
  instrumentations: [getNodeAutoInstrumentations()],
});
```

LLM traces flow **directly to Langfuse, bypassing the Alloy → Tempo pipeline** [68]. When Langfuse is unreachable, these traces are silently lost. The `LangfuseClient` wrapper in `libs/observability/src/langfuse/client.ts` exposes `createTrace`, `createGeneration`, `createSpan`, `createScore`, and `updateTrace` [23], with execution flow tracing gated by `if (process.env.LANGFUSE_PUBLIC_KEY)` [25].

### 5. Staging-Specific Configuration

Staging has hardcoded developer paths as fallback bind-mounts:

```yaml
# docker-compose.staging.yml [9][47]
volumes:
  - ${PROJECTS_MOUNT:-/home/josh/dev}:${PROJECTS_MOUNT:-/home/josh/dev}:rw
  - ${LABS_MOUNT:-/home/josh/labs}:${LABS_MOUNT:-/home/josh/labs}:rw
```

Production uses only named volumes [48] — this is a deliberate parity gap enabling live filesystem access for agent workloads on staging. Staging also uses a stricter readiness probe (`/api/health/ready`) vs. production's liveness probe (`/api/health`) [38][39]:

```yaml
# staging — strict readiness [38]
healthcheck:
  test: ['CMD', 'curl', '-f', 'http://127.0.0.1:3008/api/health/ready']
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s

# dev — liveness only [37]
healthcheck:
  test: ['CMD', 'curl', '-f', 'http://localhost:3008/api/health']
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 60s
```

### 6. Volume Architecture

| Context | Volume Name | Type |
|---|---|---|
| Dev | `automaker-data` | Named [1] |
| Dev | `automaker-dev-node-modules` | Named, shared between server/ui [1] |
| Prod | `automaker-data-prod` | Named [12] |
| Staging | `automaker-data` | External [15] |
| Backup set | `automaker-data`, `automaker-claude-config`, `automaker-cursor-config`, `automaker-opencode-{data,config,cache}` | Named [51] |

Backup/restore uses Alpine tar containers — no database engine or migration tooling exists [51][52]:

```bash
# scripts/backup-volumes.sh [61]
VOLUMES=(
  "automaker-data"
  "automaker-claude-config"
  "automaker-cursor-config"
  "automaker-opencode-data"
  "automaker-opencode-config"
  "automaker-opencode-cache"
)
for volume in "${VOLUMES[@]}"; do
  docker run --rm \
    -v "${volume}${VOLUME_SUFFIX}:/source:ro" \
    -v "${BACKUP_DIR}:/backup" \
    alpine tar czf "/backup/${volume}.tar.gz" -C /source .
done
```

---

## Relevant Patterns & Integration Points

### OTel Pipeline Architecture

The Alloy collector is the canonical ingestion point for the LGTM stack [13][30]:

```alloy
// observability/alloy-config.alloy:7-21 [13]
otelcol.receiver.otlp "default" {
  grpc {
    endpoint = "0.0.0.0:4317"
  }
  http {
    endpoint = "0.0.0.0:4318"
  }
  output {
    traces  = [otelcol.processor.batch.default.input]
    metrics = [otelcol.processor.batch.metrics.input]
    logs    = [otelcol.processor.batch.logs.input]
  }
}
```

Fan-out destinations [30]:

```alloy
// observability/alloy-config.alloy:52-86 [30]
otelcol.exporter.otlp "tempo" {
  client { endpoint = "tempo:4317"  tls { insecure = true } }
}
prometheus.remote_write "mimir" {
  endpoint { url = "http://mimir:9009/api/v1/push" }
}
loki.write "loki" {
  endpoint { url = "http://loki:3100/loki/api/v1/push" }
}
```

Alloy also scrapes its own metrics into Mimir [30]:

```alloy
// observability/alloy-config.alloy:90-97
prometheus.exporter.self "alloy" {}

prometheus.scrape "alloy_self" {
  targets    = prometheus.exporter.self.alloy.targets
  forward_to = [prometheus.remote_write.mimir.receiver]
  scrape_interval = "30s"
}
```

### Prometheus Metrics (Application-Side)

The server exposes `prom-client` metrics at `/api/metrics/prometheus` [29] including:

```typescript
// apps/server/src/lib/prometheus.ts:26-130 [29]
// http_requests_total, http_request_duration_seconds, active_agents_count,
// agent_execution_duration_seconds, agent_cost_usd_total, agent_tokens_input_total,
// agent_tokens_output_total, agent_executions_total, features_by_status,
// node_js_heap_used_bytes, websocket_connections_active
```

Currently scraped by standalone Prometheus via `host.docker.internal:3008` [28]. In the consolidated stack, Alloy can scrape this endpoint directly and remote_write to Mimir, eliminating the standalone Prometheus entirely.

### Langfuse as Transitive Dependency

The Claude Code subprocess inherits Langfuse OTel configuration [22]:

```typescript
// apps/server/src/providers/claude-provider.ts:193-205 [22]
if (langfusePublicKey && langfuseSecretKey && langfuseBaseUrl) {
  env['CLAUDE_CODE_ENABLE_TELEMETRY'] = '1';
  env['OTEL_EXPORTER_OTLP_ENDPOINT'] = `${langfuseBaseUrl}/api/public/otel`;
  env['OTEL_EXPORTER_OTLP_HEADERS'] =
    `Authorization=Basic ${Buffer.from(`${langfusePublicKey}:${langfuseSecretKey}`).toString('base64')}`;
}
```

This makes Langfuse a **transitive dependency of every agent spawn**. A self-hosted replacement must expose the same OTLP endpoint path (`/api/public/otel/v1/traces`) and accept Basic auth [34][35].

### Deploy Pipeline Mechanics

**Drain → Build → Health → Smoke → Rollback** is the deploy sequence [40][43]:

```yaml
# .github/workflows/deploy-main.yml [58]
- name: Tag current images as rollback
  run: |
    docker tag automaker-server:latest automaker-server:rollback || true
    docker tag automaker-ui:latest automaker-ui:rollback || true
- name: Rollback on failure
  if: failure() && steps.rebuild.outcome != 'skipped'
  run: |
    docker tag automaker-server:rollback automaker-server:latest
    docker tag automaker-ui:rollback automaker-ui:latest
    docker compose down && docker compose up -d
    for i in $(seq 1 15); do
      if curl -sf http://localhost:3008/api/health; then break; fi
      sleep 2
    done
```

Key constraints:
- **Disk pre-checks**: 5 GB min for main, 10 GB min for staging, with automatic `docker system prune -af --volumes` [41][42]
- **Serialized deployments**: Concurrency groups prevent parallel main/staging runs [55][56]
- **CRDT state reset**: `rm -rf .automaker/features/` before `--force-recreate` [49][50]
- **Resource auto-tuning** based on RAM detection [53]:

```bash
# scripts/setup-staging.sh [62]
TOTAL_RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM_GB" -ge 96 ]; then
  MEM_LIMIT="64g"; CPU_LIMIT="12"; MAX_AGENTS=8
elif [ "$TOTAL_RAM_GB" -ge 48 ]; then
  MEM_LIMIT="48g"; CPU_LIMIT="8";  MAX_AGENTS=6
elif [ "$TOTAL_RAM_GB" -ge 24 ]; then
  MEM_LIMIT="16g"; CPU_LIMIT="8";  MAX_AGENTS=4
else
  MEM_LIMIT="8g";  CPU_LIMIT="$(($(nproc)-1))"; MAX_AGENTS=2
fi
```

### Smoke Test Coverage

Six-phase validation [36][57]:

```bash
# scripts/smoke-test.sh [57]
test_endpoint "GET" "/api/health" "" "" "status"
test_endpoint "GET" "/api/health/ready" "" "" "status"
AUTH_RESPONSE=$(curl -s -c "$COOKIE_JAR" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\": \"$API_KEY\"}" \
  "${BASE_URL}/api/auth/login")
```

Tests health endpoints, auth/session, protected endpoints, UI HTML integrity, docs site, and WebSocket token. Discord alerting on failure [36].

### Environment Variable Patterns

| Context | Pattern | Example |
|---|---|---|
| Dev/Staging | Plain env vars | `ANTHROPIC_API_KEY=sk-ant-...` [17] |
| Production | Docker Secrets `_FILE` suffix | `ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic_api_key` [16] |
| Observability | Langfuse keys + OTEL service name | `LANGFUSE_PUBLIC_KEY`, `OTEL_SERVICE_NAME` [18] |
| Containerization flag | All environments | `IS_CONTAINERIZED=true` [17] |

---

## External Research

### Grafana Alloy as Canonical Collector

Grafana Alloy is Grafana Labs' distribution of the OpenTelemetry Collector [70], wrapping `otelcol.*` components with HCL configuration syntax and a built-in visual pipeline UI at `:12345` [71]. Since both tools speak standard OTLP, the application's `otel.ts` works identically with either Alloy or a vanilla OTel Collector — **switching requires zero code changes** [73].

### Promtail Deprecation

Grafana Labs officially declared Promtail "feature complete" with all future log collection development in Alloy [72]. The `docker-compose.monitoring.yml` stack uses `grafana/promtail:3.2.0` [66] — this is legacy infrastructure that should be retired.

### Mimir vs. Standalone Prometheus

Mimir provides multi-tenant, horizontally scalable long-term metric storage via Prometheus-compatible remote_write [69]. The observability stack already uses Mimir at `:9009` [26], making the standalone Prometheus instance in the monitoring stack redundant.

### Loki Characteristics

Loki's label-based indexing (no full-text search) is optimal for container/service-level logs with controlled operational cost [74], particularly effective in ephemeral/high-volume environments [75]. The project correctly configures Loki 3.2 with tsdb schema v13 [67].

### Langfuse Self-Hosting Overhead

Self-hosted Langfuse requires **PostgreSQL + ClickHouse + Redis + S3** [76] — substantial infrastructure overhead for what is currently a single-machine staging setup. **Arize Phoenix** is a lighter alternative: single Docker container, open-source, no additional infrastructure dependencies [77]. However, Phoenix would require code changes to the Langfuse SDK integration surfaces [23].

### LGTM Stack Validation

The LGTM stack (Loki + Grafana + Tempo + Mimir) is Grafana Labs' canonical architecture for unified observability with correlated logs, metrics, and traces [78]. The project's observability stack implements this correctly [26].

---

## Recommended Approach

### Phase 1: Consolidate Compose Files

1. **Create `docker-compose.infra.yml`** containing the unified LGTM stack: Alloy, Tempo, Loki, Mimir, single Grafana instance.
2. **Retire `docker-compose.monitoring.yml`** entirely — Prometheus, Promtail [66], Node Exporter, and monitoring Grafana (`:3010`) [4] are superseded.
3. **Absorb Prometheus scraping into Alloy** — add a `prometheus.scrape` block targeting `server:3008/api/metrics/prometheus` in the Alloy config, forwarding to `prometheus.remote_write.mimir` [28][30]. This preserves all existing application metrics [29] with zero code changes.
4. **Merge staging-specific overrides** into `docker-compose.staging.yml` as an override file (`-f docker-compose.infra.yml -f docker-compose.staging.yml`), keeping host-path mounts [47] and CRDT ports [9] separate from the base infra definition.
5. **Consolidate to a single Grafana** on `:3011` (or `:3000` for prod), with provisioned datasources for Tempo, Loki, and Mimir [33].

### Phase 2: Resolve Langfuse Dependency

Two options, ordered by complexity:

**Option A (Recommended): Self-host Langfuse in the compose stack.** Add `langfuse`, `postgres`, `clickhouse`, and `redis` services to `docker-compose.infra.yml`. Update `LANGFUSE_BASE_URL` to `http://langfuse:3000`. This preserves all existing SDK integrations [23][24][25] and OTLP endpoints [20][22] with only env var changes. The infrastructure cost is 4 additional containers [76].

**Option B: Replace Langfuse with Arize Phoenix.** Single container, no dependencies [77]. Requires refactoring: (a) replace `LangfuseClient` wrapper [23], (b) update `LangfuseSpanProcessor` → Phoenix-compatible processor [21], (c) modify Claude provider OTLP headers [22]. Lower operational overhead but higher migration effort.

**Regardless of choice:** Route LLM traces through Alloy → Tempo as well (currently bypassed [68]), so trace data has a durable fallback even if the LLM observability platform is temporarily unavailable.

### Phase 3: Harden the Deploy Pipeline

1. **Add `docker compose config --quiet` linting** to `pr-check.yml` [45] — catches YAML syntax errors and invalid service references before merge.
2. **Extend smoke test** [36] to validate observability endpoints: Alloy health (`:12345`), Grafana (`:3011`), and Langfuse/Phoenix readiness.
3. **Parameterize compose file selection** in deploy workflows to use the consolidated `docker-compose.infra.yml` alongside the environment-specific override file.
4. **Update `setup-staging.sh`** [15] to reference the new infra compose file and include observability services in the lifecycle (drain, start, teardown).

### Phase 4: Configuration Hygiene

1. **Extract inline configs** [14] to on-disk files under `observability/` for version control diffability.
2. **Remove hardcoded `/home/josh/` paths** [9] — ensure `PROJECTS_MOUNT` and `LABS_MOUNT` are always set via `.env` with no fallback to developer-specific paths.
3. **Resolve the volume name collision** [2][3] — the unified stack eliminates this by having a single Loki instance, but validate no orphaned volumes remain after migration.

---

## Open Questions & Risks

1. **Langfuse data migration**: If the broken `langfuse.proto-labs.ai` instance [19] has historical trace data in its backing store, is that data recoverable? If self-hosting, should the new instance import old data or start fresh?

2. **Single-machine resource budget**: Self-hosted Langfuse adds PostgreSQL + ClickHouse + Redis [76] to a machine already running the LGTM stack plus application services. The resource auto-tuning [53] currently sizes for application workloads only — observability overhead may require recalibration of the RAM tiers.

3. **`docker-compose.staging.yml` location**: This file was found in worktrees but its presence on `main` was not definitively confirmed. The deploy workflow references it [15][42], so it must exist or be created as part of this work.

4. **Dual-write trace reliability**: Currently, `otel.ts` registers two span processors that both fail if Langfuse is unreachable [34]. After consolidation, should the OTLP exporter point to Alloy (for Tempo durability) and only the `LangfuseSpanProcessor` point to Langfuse? This would ensure infrastructure traces survive Langfuse outages.

5. **Prometheus metric continuity**: Switching from standalone Prometheus scraping [28] to Alloy-based scraping with Mimir storage changes the query API from Prometheus's native API (`:9090`) to Mimir's Prometheus-compatible API (`:9009`). Existing Grafana dashboards targeting the Prometheus datasource need re-pointing.

6. **No compose linting in CI** [45][46]: Adding `docker compose config` validation requires the CI runner to have Docker Compose V2 installed. The current PR check runs on `ubuntu-latest` [63] which includes it, but this should be verified.

7. **Docs compose file** [11] uses an external Coolify network and Traefik — should this be folded into the infra stack or remain a separate concern?

8. **Secret management divergence**: Staging uses plain env vars while production uses Docker Secrets with `_FILE` suffix [16][17]. The unified infra compose file needs to support both patterns without duplication.

---

## Citations

| # | Source | Description |
|---|---|---|
| [1] | `docker-compose.yml:1` | Root compose file header — isolated dev environment |
| [2] | `docker-compose.monitoring.yml:29` | Loki container name and volume in monitoring stack |
| [3] | `docker-compose.observability.yml:47` | Loki container name and volume in observability stack |
| [4] | `docker-compose.monitoring.yml:58` | Monitoring Grafana port 3010 |
| [5] | `docker-compose.observability.yml:95` | Observability Grafana port 3011 |
| [6] | `docker-compose.prod.yml:207` | Production Grafana port 3000 |
| [7] | `docker-compose.yml:17` | UI service: Nginx on port 3007 |
| [8] | `docker-compose.yml:30` | Server service: Node.js on port 3008 |
| [9] | `.worktrees/.../docker-compose.staging.yml:117` | Hardcoded `/home/josh/dev` fallback bind-mount |
| [10] | `docker/dev-server/docker-compose.yml:72` | Watchtower auto-update, 5-min poll from GHCR |
| [11] | `.worktrees/.../docker-compose.docs.yml:25` | Traefik/Let's Encrypt docs deployment |
| [12] | `docker-compose.prod.yml:275` | Production volume `automaker-data-prod` |
| [13] | `observability/alloy-config.alloy:7` | Alloy OTLP receiver configuration |
| [14] | `docker-compose.observability.yml:121` | Inline Docker configs for Tempo/Loki/Mimir |
| [15] | `scripts/setup-staging.sh:1` | Primary IaC tool referencing staging compose |
| [16] | `docker-compose.prod.yml:84` | Docker Secrets `_FILE` pattern |
| [17] | `apps/server/.env.example:9` | Plain env var pattern |
| [18] | `apps/server/.env.example:102-115` | Langfuse and OTEL env var definitions |
| [19] | `.env:39-42` | Live Langfuse config pointing to `langfuse.proto-labs.ai` |
| [20] | `apps/server/src/lib/otel.ts:27-29, 54-59` | OTLP exporter targeting Langfuse |
| [21] | `apps/server/src/lib/otel.ts:63-67` | LangfuseSpanProcessor registration |
| [22] | `apps/server/src/providers/claude-provider.ts:193-205` | Claude subprocess Langfuse OTel injection |
| [23] | `libs/observability/src/langfuse/client.ts:30-269` | LangfuseClient SDK wrapper |
| [24] | `apps/server/src/lib/langfuse-singleton.ts:24-26` | Singleton instantiation from env vars |
| [25] | `apps/server/src/routes/flows/routes/execute.ts:67` | Flow tracing gated by `LANGFUSE_PUBLIC_KEY` |
| [26] | `docker-compose.observability.yml:4-119` | Full LGTM stack service definitions |
| [27] | `docker-compose.monitoring.yml:4-84` | Full Prometheus monitoring stack |
| [28] | `monitoring/prometheus/prometheus.yml` | Prometheus scrape config for automaker-server |
| [29] | `apps/server/src/lib/prometheus.ts:8-21` | prom-client Registry and custom metrics |
| [30] | `observability/alloy-config.alloy:7-86` | Alloy fan-out to Tempo, Mimir, Loki |
| [31] | `monitoring/promtail/config.yml:12-42` | Promtail Docker socket log shipping |
| [32] | `docker-compose.dev.yml:97-138` | Dev healthcheck and dependency chain |
| [33] | `docker-compose.observability.yml:90-119` | Grafana depends_on for LGTM services |
| [34] | `apps/server/src/lib/otel.ts:54-67` | Both processors fail if Langfuse unreachable |
| [35] | `apps/server/src/routes/langfuse/index.ts:21-23` | Route layer reads Langfuse env vars |
| [36] | `scripts/smoke-test.sh:1-181` | Six-phase smoke test with Discord alerting |
| [37] | `docker-compose.dev.yml` | Dev liveness probe, 60s start period |
| [38] | `docker-compose.staging.yml` | Staging readiness probe `/api/health/ready` |
| [39] | `docker-compose.prod.yml` | Prod liveness probe, 30s start, 3 retries |
| [40] | `.github/workflows/deploy-main.yml:97-237` | Rollback tagging and auto-restore sequence |
| [41] | `.github/workflows/deploy-main.yml:43-66` | 5 GB disk minimum with auto-prune |
| [42] | `.github/workflows/deploy-staging.yml` | 10 GB staging disk minimum |
| [43] | `.github/workflows/deploy-main.yml:88-95` | Agent drain POST, 180s timeout |
| [44] | `scripts/setup-staging.sh:382-403` | Script-based drain, non-fatal on failure |
| [45] | `.github/workflows/pr-check.yml:1-47` | PR check: build only, no compose linting |
| [46] | `.github/workflows/test.yml:1-74` | Test workflow: no compose validation |
| [47] | `docker-compose.staging.yml` | Host-path bind mounts for projects/labs |
| [48] | `docker-compose.yml` | Named volumes only, no host filesystem access |
| [49] | `scripts/setup-staging.sh:209-259` | CRDT state reset before force-recreate |
| [50] | `.github/workflows/deploy-staging.yml:218-221` | CI CRDT state reset |
| [51] | `scripts/backup-volumes.sh:24-31` | Six named volumes backed via tar |
| [52] | `scripts/restore-volumes.sh:1-110` | Restore: metadata read, destroy, untar, restart |
| [53] | `scripts/setup-staging.sh:116-164` | RAM-based resource auto-tuning tiers |
| [54] | `docs/internal/dev/testing-patterns.md:5-33` | Event index comparison, keyword assertions |
| [55] | `.github/workflows/deploy-main.yml` | Concurrency group: `main-deploy` |
| [56] | `.github/workflows/deploy-staging.yml` | Staging timeout 60 min, serialized |
| [57] | `scripts/smoke-test.sh` | Health + auth smoke test excerpts |
| [58] | `.github/workflows/deploy-main.yml` | Rollback tagging YAML excerpt |
| [62] | `scripts/setup-staging.sh` | Resource auto-tuning code excerpt |
| [63] | `.github/workflows/pr-check.yml` | PR check job on `ubuntu-latest` |
| [66] | `docker-compose.monitoring.yml:43` | Promtail 3.2.0 (deprecated) |
| [67] | `docker-compose.observability.yml:192-199` | Loki 3.2 with tsdb schema v13 |
| [68] | `apps/server/src/lib/otel.ts:54-58` | LLM traces bypass Alloy → Tempo |
| [69] | `docker-compose.observability.yml:204-244` | Mimir service definition |
| [70] | grafana.com/oss/alloy-opentelemetry-collector/ | Alloy as OTel Collector distribution |
| [71] | oneuptime.com/blog/...compare-opentelemetry-collector-vs-grafana-alloy | Alloy wraps otelcol.* components, visual UI |
| [72] | grafana.com/docs/loki/latest/get-started/overview/ | Promtail declared feature-complete |
| [73] | fusion-reactor.com/blog/opentelemetry-collector-vs-grafana-alloy | OTLP standard: zero code changes to switch |
| [74] | signoz.io/blog/loki-alternatives/ | Loki label-based indexing, cardinality limits |
| [75] | plural.sh/blog/loki-vs-elk-kubernetes/ | Loki effective for ephemeral high-volume environments |
| [76] | braintrust.dev/articles/langfuse-alternatives-2026 | Langfuse self-hosted requires PG+CH+Redis+S3 |
| [77] | softcery.com/lab/top-8-observability-platforms... | Arize Phoenix: single container, open-source |
| [78] | grafana.com/oss/loki/ | LGTM stack: canonical unified observability |