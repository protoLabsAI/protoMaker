# Monitoring & Observability

This guide covers health checks, logging, and observability for Automaker.

## Health Checks

### API Health Endpoint

```bash
curl http://localhost:3008/api/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2026-02-05T10:30:00.000Z",
  "version": "1.0.0"
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

### Using the /devops Skill

```
/devops health
```

This runs a comprehensive health check including:

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

### Log Analysis with /devops

```
/devops logs
```

Analyzes container logs for:

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

```bash
curl http://localhost:3008/api/board/summary \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Response:

```json
{
  "columns": {
    "backlog": 5,
    "in-progress": 2,
    "review": 1,
    "done": 10
  },
  "runningAgents": 2,
  "queuedFeatures": 3
}
```

### Running Agents

```bash
curl http://localhost:3008/api/agents/running \
  -H "Authorization: Bearer YOUR_API_KEY"
```

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
# Recent failures
journalctl -u automaker --since="1 hour ago" | grep -i fail

# Follow logs
journalctl -u automaker -f
```

### External Monitoring

For production deployments, consider:

| Tool         | Purpose                |
| ------------ | ---------------------- |
| Uptime Robot | External health checks |
| Prometheus   | Metrics collection     |
| Grafana      | Visualization          |
| PagerDuty    | Alerting               |

## Prometheus Integration (Optional)

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'automaker'
    static_configs:
      - targets: ['localhost:3008']
    metrics_path: '/api/metrics'
```

**Note:** The `/api/metrics` endpoint is not currently implemented. This is a placeholder for future observability enhancements.

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
