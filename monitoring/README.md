# Automaker Monitoring Stack

This directory contains the configuration for the Automaker monitoring stack using Loki, Promtail, Prometheus, and Grafana.

## Quick Start

```bash
# Start the monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f

# Stop the stack
docker-compose -f docker-compose.monitoring.yml down
```

## Services

- **Prometheus** - Metrics storage and querying (http://localhost:9090)
- **Loki** - Log aggregation (http://localhost:3100)
- **Promtail** - Log collector (tails Docker container logs)
- **Grafana** - Visualization dashboard (http://localhost:3000)

## Grafana Access

- URL: http://localhost:3000
- Default credentials: `admin` / `admin`
- Data sources are auto-provisioned:
  - Prometheus (default)
  - Loki

## Verification Steps

### 1. Verify Services are Running

```bash
docker ps | grep automaker
```

You should see 4 containers:
- automaker-prometheus
- automaker-loki
- automaker-promtail
- automaker-grafana

### 2. Check Loki Health

```bash
curl http://localhost:3100/ready
```

Should return `ready`.

### 3. Verify Logs in Grafana

1. Open Grafana at http://localhost:3000
2. Go to Explore (compass icon in left sidebar)
3. Select "Loki" data source
4. Run a query: `{job="docker"}` or `{service="server"}`
5. You should see logs from Docker containers

### 4. Search by Container Name

Query examples:
```logql
# All logs from server container
{container_name="automaker-server"}

# All logs from UI container
{container_name="automaker-ui"}

# All logs from docs container
{container_name="automaker-docs"}

# All logs with errors
{job="docker"} |= "error"
```

## Log Labels

Promtail automatically adds these labels to all Docker container logs:

- `container_name` - Docker container name
- `container_id` - Docker container ID
- `service` - Compose service name (if available)
- `compose_project` - Compose project name
- `image` - Docker image name
- `stream` - Log stream (stdout/stderr)
- `job` - Scrape job name

## Retention

Loki is configured with:
- **Retention period**: 7 days
- **Compaction interval**: 10 minutes
- **Automatic cleanup**: Enabled

This keeps disk usage manageable while retaining recent logs for debugging.

## Troubleshooting

### Promtail not collecting logs

Check Promtail has access to Docker socket:
```bash
docker exec automaker-promtail ls -la /var/run/docker.sock
```

### No logs in Grafana

1. Check Promtail is running: `docker logs automaker-promtail`
2. Check Loki is receiving logs: `curl http://localhost:3100/loki/api/v1/label`
3. Verify data source in Grafana: Settings → Data Sources → Loki

### High disk usage

Adjust retention in `monitoring/loki/local-config.yml`:
```yaml
limits_config:
  retention_period: 168h  # Change to 72h for 3 days, etc.
```

## Configuration Files

- `loki/local-config.yml` - Loki server configuration
- `promtail/config.yml` - Promtail scrape configuration
- `grafana/provisioning/datasources/` - Auto-provisioned data sources
