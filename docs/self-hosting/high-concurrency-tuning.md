# High-Concurrency Tuning

Operations guide for monitoring, tuning, and troubleshooting high-concurrency protoLabs deployments. See [High-Concurrency Deployment](./staging-deployment.md) for initial setup.

## Monitoring & Observability

### Real-Time Resource Monitoring

```bash
# Container resource usage
docker stats automaker-server-staging --no-stream

# Memory details
docker exec automaker-server-staging free -h

# Process list with memory
docker exec automaker-server-staging ps aux --sort=-%mem | head -20
```

### Agent Status Monitoring

```bash
# Running agents
curl http://localhost:3008/api/agents/running \
  -H "X-API-Key: $AUTOMAKER_API_KEY"

# Board summary
curl http://localhost:3008/api/board/summary?projectPath=/projects/myproject \
  -H "X-API-Key: $AUTOMAKER_API_KEY"

# Auto-mode status
curl http://localhost:3008/api/auto-mode/status?projectPath=/projects/myproject \
  -H "X-API-Key: $AUTOMAKER_API_KEY"
```

### Health Checks

```bash
# API health
curl -f http://localhost:3008/api/health || echo "UNHEALTHY"

# Container health
docker inspect automaker-server-staging --format '{{.State.Health.Status}}'

# Health check logs
docker inspect automaker-server-staging --format '{{json .State.Health}}' | jq
```

### Log Analysis

```bash
# Follow logs with timestamp
docker compose -f docker-compose.staging.yml logs -f --timestamps

# Search for errors
docker compose -f docker-compose.staging.yml logs server | grep -i error

# Agent-specific logs
docker compose -f docker-compose.staging.yml logs server | grep "Agent\|feature"

# Memory warnings
docker compose -f docker-compose.staging.yml logs server | grep -i "memory\|heap"
```

## Performance Tuning

### Memory Pressure Indicators

Watch for these signs in logs:

```
[WARN] High memory usage: 42GB / 48GB (87%)
[ERROR] JavaScript heap out of memory
[WARN] Garbage collection taking longer than expected
```

If you see these, reduce `maxConcurrency`.

### CPU Bottlenecks

```bash
# Check CPU usage
docker stats automaker-server-staging --no-stream

# If CPU consistently > 80%
# - Reduce maxConcurrency
# - Upgrade to more CPU cores
# - Check for runaway agents (infinite loops)
```

### Disk I/O

```bash
# Disk usage
docker exec automaker-server-staging df -h

# If high I/O wait:
# - Use SSD storage
# - Check for excessive logging
# - Review worktree cleanup
```

### Scaling

**Vertical scaling** (current approach): increase resources on single host.

- 48GB, 64GB, 96GB RAM
- 8, 12, 16 CPU cores
- Adjust `maxConcurrency` proportionally

**Rule of thumb:** 6GB RAM per concurrent agent (mixed complexity).

## Troubleshooting

### Server Crashes Under Load

**Symptoms:** Container exits with code 137 (OOM kill), logs show "Killed" or heap errors, agents stuck in "running" state.

**Solutions:**

1. Check memory usage: `docker stats automaker-server-staging`
2. Reduce concurrency in settings
3. Increase memory limit in docker-compose
4. Review feature complexity distribution

### Slow Agent Performance

**Symptoms:** Agents take much longer than expected, high CPU but low memory, logs show "waiting for API response".

**Solutions:**

1. Check network latency to Anthropic API
2. Review MCP tool usage (heavy Discord queries can slow agents)
3. Check for context file bloat (`> 100KB` files slow agents)

### Docker Volume Issues

**Symptoms:** "No space left on device", slow file operations.

**Solutions:**

1. Check volume usage: `docker system df -v`
2. Clean up: `docker system prune -a --volumes`
3. Review data directory size

## Environment Variables

### Adding a New Env Var

1. Add to `.env` at `/home/deploy/staging/automaker/.env`
2. Add to `docker-compose.staging.yml` environment section
3. **Recreate** the container (restart does NOT re-read `.env`):

```bash
cd /home/deploy/staging/automaker
docker stop automaker-server && docker rm automaker-server
docker compose -p automaker-staging -f docker-compose.staging.yml up -d server --no-deps
```

### API Key Authentication

protoLabs uses `X-API-Key` header (NOT `Authorization: Bearer`):

```bash
curl http://localhost:3008/api/health -H "X-API-Key: $AUTOMAKER_API_KEY"
```

## Automated Deploys

Staging auto-deploys from `main` via a GitHub Actions self-hosted runner.

### How It Works

1. Code merges to `main`
2. `deploy-staging.yml` triggers on the self-hosted runner
3. Workflow uses persistent deploy directory (`/home/deploy/staging/automaker`)
4. Drain step gracefully stops agents (up to 2 min timeout)
5. Rollback images tagged before build
6. `setup-staging.sh --build` builds and `--start` restarts
7. Health check + smoke tests verify the deploy
8. Rollback on failure, Discord notification posted

### Zero-Downtime Deploy (Agent Drain)

```
push to main > drain API > agents finish/stop > build > restart > auto-resume
```

**Drain endpoint:** `POST /api/deploy/drain`
**Status endpoint:** `GET /api/deploy/status`

```bash
# Manual drain
./scripts/setup-staging.sh --drain

# Via curl
curl -X POST http://localhost:3008/api/deploy/drain \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AUTOMAKER_API_KEY"
```

### Manual Deploy

```bash
git pull origin main
./scripts/setup-staging.sh --build
./scripts/setup-staging.sh --start
```

## CD Pipeline Troubleshooting

### Workspace Deleted Mid-Build

**Cause:** Runner cleanup cron deletes `_work/` during builds.
**Fix:** Deploy workflow uses persistent directory, env vars sourced via `set -a`.

### Docker Build Fails on `build:packages`

**Cause:** `packages/` not in Docker build context.
**Fix:** Dockerfile uses `npm run build:libs` (not `build:packages`).

### Discord Notifications Silent

**Cause:** `DISCORD_DEPLOY_WEBHOOK` GitHub secret not set.

| Secret                   | Purpose                   | Channel      |
| ------------------------ | ------------------------- | ------------ |
| `DISCORD_DEPLOY_WEBHOOK` | Deploy notifications      | #deployments |
| `DISCORD_ALERTS_WEBHOOK` | Smoke test failure alerts | #deployments |

## Staging Hardening

- **Nginx**: gzip, security headers, proxy buffers, static asset caching
- **Rate limiting**: 300 req/min general, 20 req/15min auth
- **WebSocket**: exponential backoff reconnect, shutdown broadcast
- **Smoke tests**: API health, features, UI, docs, WebSocket auth
- **Deploy safety**: disk pre-check, rollback images, crash loop protection (`on-failure:5`)
