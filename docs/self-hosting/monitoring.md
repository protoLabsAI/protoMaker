# Monitoring & Observability

This guide covers health checks, logging, and observability for protoLabs.

## Health Checks

### API Health Endpoint

```bash
curl http://localhost:3008/api/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2026-02-05T10:30:00.000Z"
}
```

### Docker Health Check

The server container includes a built-in health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3008/api/health || exit 1
```

Check container health:

```bash
# View health status
docker inspect automaker-server --format '{{.State.Health.Status}}'

# View health check logs
docker inspect automaker-server --format '{{json .State.Health}}' | jq
```

Possible statuses:

- `healthy` - Health check passing
- `unhealthy` - Health check failing
- `starting` - Within start period

### Using Frank (DevOps Persona)

Invoke `/frank` and ask for a health check:

```
/frank
> run a health check
```

Frank (via the `devops-health-check` agent) runs a comprehensive health check including:

- Docker daemon status
- Container states
- Volume availability
- API endpoint responses
- WebSocket connectivity
- CLI tool availability
- Authentication status

## Logging

### Container Logs

```bash
# All services
docker compose logs -f

# Server only
docker compose logs -f server

# UI only
docker compose logs -f ui

# Last 100 lines
docker compose logs --tail=100 server

# Since timestamp
docker compose logs --since="2026-02-05T10:00:00" server
```

### Log Levels

Server logs use structured output with levels:

```
[INFO] Server started on port 3008
[WARN] No ANTHROPIC_API_KEY found, using CLI auth
[ERROR] Failed to connect to database
```

### Log Analysis with Frank

Invoke `/frank` and ask for log analysis:

```
/frank
> analyze the container logs
```

Frank (via the `devops-logs` agent) analyzes container logs for:

- Error patterns and stack traces
- Warning frequencies
- Request/response patterns
- Performance indicators

## Container Metrics

### Resource Usage

```bash
# Real-time stats
docker stats automaker-server automaker-ui

# One-time snapshot
docker stats --no-stream
```

Output:

```
CONTAINER ID   NAME               CPU %     MEM USAGE / LIMIT     MEM %
abc123         automaker-server   0.50%     256MiB / 4GiB         6.25%
def456         automaker-ui       0.01%     32MiB / 1GiB          3.13%
```

### Disk Usage

```bash
# Docker disk usage summary
docker system df

# Detailed breakdown
docker system df -v

# Volume sizes
docker volume ls
docker system df --format '{{.Type}}\t{{.Size}}'
```

## WebSocket Monitoring

### Connection Status

The UI maintains a WebSocket connection to the server for real-time updates.

Check WebSocket health via browser DevTools:

1. Open DevTools → Network → WS
2. Look for connection to `ws://localhost:3008/api`
3. Monitor frame activity

### Server-Side Events

The server emits events for:

- Agent start/stop
- Feature status changes
- Terminal output
- Auto-mode progress

## Application Metrics

### Board Summary

Board state (per-status counts, WIP saturation) is exposed through the
**`get_board_summary` MCP tool**, not a public REST endpoint. There is no
`/api/board/summary` or `/api/agents/running` HTTP route. Query the board via the
`protomaker` CLI:

```bash
protomaker board          # per-status summary table
protomaker board --json   # raw JSON
```

See [MCP Tools](./../reference/mcp-tools.md) for `get_board_summary` and the
related feature/agent query tools.

## Alerting

### Docker Compose Health Dependencies

Use health check dependencies to restart unhealthy services:

```yaml
services:
  ui:
    depends_on:
      server:
        condition: service_healthy
```

### systemd Notifications

With systemd, failed containers trigger restart:

```ini
[Service]
Restart=on-failure
RestartSec=10
```

Check for failures:

```bash
# Recent failures (substitute the unit you enabled)
journalctl -u automaker-docker --since="1 hour ago" | grep -i fail

# Follow logs
journalctl -u automaker-host -f
```

### External Monitoring

For production deployments, consider:

| Tool         | Purpose                |
| ------------ | ---------------------- |
| Uptime Robot | External health checks |
| Prometheus   | Metrics collection     |
| Grafana      | Visualization          |
| PagerDuty    | Alerting               |

## Prometheus + Grafana (Monitoring Stack)

The Prometheus / Grafana / Loki monitoring stack lives in **`docker-compose.infra.yml`**
(services `automaker-prometheus`, `automaker-grafana`, `automaker-loki`, plus
`automaker-promtail` for log shipping). The production app compose
(`docker-compose.prod.yml`) only runs `ui` + `server` — it does not include monitoring.

| Service    | Container              | Host Port | Purpose                  |
| ---------- | ---------------------- | --------- | ------------------------ |
| Prometheus | `automaker-prometheus` | 9090      | Metrics collection       |
| Loki       | `automaker-loki`       | 3100      | Log aggregation          |
| Grafana    | `automaker-grafana`    | 3010      | Metrics & log dashboards |

### Configuration

Config files are mounted from `infra/`:

- Prometheus scrape config: `infra/prometheus/prometheus.yml`
- Loki config: `infra/loki/config.yml`
- Promtail config: `infra/promtail/config.yml`
- Grafana datasources (auto-provisioned): `infra/grafana/datasources.yml`

### Deploying

```bash
docker compose -f docker-compose.infra.yml up -d
```

### Grafana Setup

Grafana is configured for anonymous Admin access by default (`GF_AUTH_ANONYMOUS_ENABLED=true`),
so there is no admin password secret to rotate out of the box.

1. Access Grafana at `http://localhost:3010`
2. Prometheus and Loki data sources are provisioned automatically from
   `infra/grafana/datasources.yml`
3. For a non-local deployment, restrict Grafana's exposure (reverse proxy / auth)
   before opening it beyond localhost.

**Note:** A `/api/metrics` Prometheus exporter on the server is not yet implemented.
Currently the `/api/health` endpoint provides basic application observability;
the infra stack scrapes container/host metrics. Full server-side application metrics
will be added in a future release.

## Debugging

### Container Shell Access

```bash
# As automaker user
docker exec -it automaker-server bash

# As root
docker exec -it -u root automaker-server bash
```

### Process Inspection

```bash
# Running processes
docker exec automaker-server ps aux

# Open files
docker exec automaker-server lsof

# Network connections
docker exec automaker-server netstat -tlnp
```

### Environment Variables

```bash
# View all env vars
docker exec automaker-server env

# Check specific variable
docker exec automaker-server printenv ANTHROPIC_API_KEY
```

### File System

```bash
# Check data directory
docker exec automaker-server ls -la /data

# Check CLI configs
docker exec automaker-server ls -la /home/automaker/.claude
docker exec automaker-server ls -la /home/automaker/.cursor
```

## Troubleshooting Commands

```bash
# Container not starting
docker compose logs server
docker inspect automaker-server --format '{{.State.ExitCode}}'

# High memory usage
docker stats --no-stream
docker exec automaker-server node --v8-options | grep -i heap

# Network issues
docker network inspect automaker_default
docker exec automaker-server curl -v http://localhost:3008/api/health

# Volume issues
docker volume inspect automaker-data
docker exec automaker-server df -h /data
```

## Log Rotation

Docker manages log rotation via the logging driver. Configure in daemon.json:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Or per-container in docker-compose:

```yaml
services:
  server:
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```
