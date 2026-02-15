# High-Concurrency Deployment

This guide covers deploying protoMaker in a staging or high-concurrency environment with high-memory configuration for increased concurrent agent capacity.

## Overview

The staging server is optimized for:

- **Concurrent Agent Execution**: 6-10 agents running simultaneously (vs 2-3 in standard production)
- **High Memory Allocation**: 48GB RAM dedicated to agent workloads
- **Development Testing**: Safe environment for testing features before production release
- **Multi-Project Support**: Can work on multiple projects including automaker itself without conflicts
- **Full Service Suite**: UI (3007), API (3008), Docs (3009), and Storybook (6666) all served via Docker

## Resource Requirements

### Hardware Specs

| Component | Minimum  | Recommended | Staging Target |
| --------- | -------- | ----------- | -------------- |
| RAM       | 8GB      | 16GB        | **48GB**       |
| CPU       | 2 cores  | 4 cores     | 8+ cores       |
| Disk      | 50GB SSD | 100GB SSD   | 200GB SSD      |
| Network   | 10 Mbps  | 100 Mbps    | 1 Gbps         |

### Agent Memory Estimates

Based on observed behavior and Claude Agent SDK usage patterns:

| Complexity    | Model  | Avg Turns | Est Memory/Agent | Max Concurrent |
| ------------- | ------ | --------- | ---------------- | -------------- |
| Small         | Haiku  | 200       | ~2GB             | 20+            |
| Medium        | Sonnet | 500       | ~4GB             | 10-12          |
| Large         | Sonnet | 750       | ~5GB             | 8-10           |
| Architectural | Opus   | 1000      | ~6GB             | 6-8            |

**Note:** These are conservative estimates. Actual usage varies based on:

- Context file size (`.automaker/context/`)
- Project complexity and file count
- MCP tool usage (Linear, Discord, etc.)
- Conversation history length

### Known Limits

- **13+ concurrent agents = server crash** (confirmed from production incidents)
- Recommended max concurrency: **8 agents** for stable operation with mixed complexity
- Use `maxConcurrency` setting in auto-mode to enforce limits

## Project Isolation

**Important:** Multiple projects with the same name can coexist without conflicts.

protoMaker isolates projects by **absolute path**, not by name. Each project's data is stored in `{projectPath}/.automaker/`.

Example - no conflicts:

```
/home/automaker/automaker/.automaker/       # Staging server's own codebase
/projects/customer-automaker/.automaker/    # Customer project being worked on
/mnt/dev/automaker/.automaker/             # Another automaker instance
```

## Docker Compose Configuration

### Staging-Optimized docker-compose.yml

Create `docker-compose.staging.yml` based on production config with increased resources:

```yaml
services:
  server:
    image: automaker-server:latest
    container_name: automaker-server-staging
    restart: unless-stopped

    # High-memory configuration for concurrent agents
    deploy:
      resources:
        limits:
          cpus: '8'
          memory: 48G
        reservations:
          cpus: '4'
          memory: 24G

    environment:
      - NODE_ENV=staging
      - HOST=0.0.0.0
      - HOSTNAME=localhost
      - PORT=3008
      - DATA_DIR=/data
      - ALLOWED_ROOT_DIRECTORY=/projects

      # API Keys (use secrets in production)
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - LINEAR_API_KEY=${LINEAR_API_KEY}
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - AUTOMAKER_API_KEY=${AUTOMAKER_API_KEY}

      # Node.js memory tuning for high-concurrency
      - NODE_OPTIONS=--max-old-space-size=32768

    volumes:
      - automaker-data:/data
      - automaker-claude-config:/home/automaker/.claude
      - automaker-cursor-config:/home/automaker/.cursor
      # Mount projects directory for multi-project work
      - /path/to/projects:/projects

    ports:
      - '3008:3008'

    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3008/api/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

    logging:
      driver: json-file
      options:
        max-size: '20m'
        max-file: '5'

  ui:
    image: automaker-ui:latest
    container_name: automaker-ui-staging
    restart: unless-stopped

    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 512M

    environment:
      - VITE_HOSTNAME=localhost

    ports:
      - '3007:80'

    depends_on:
      server:
        condition: service_healthy

    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'

volumes:
  automaker-data:
    driver: local
  automaker-claude-config:
    driver: local
  automaker-cursor-config:
    driver: local
```

### Key Configuration Changes from Production

| Setting                      | Production | Staging | Reason                              |
| ---------------------------- | ---------- | ------- | ----------------------------------- |
| Memory limit                 | 8G         | 48G     | Support 6-10 concurrent agents      |
| CPU limit                    | 2          | 8       | Parallel agent execution            |
| `NODE_OPTIONS` max-old-space | default    | 32768   | Prevent Node.js heap exhaustion     |
| Health check timeout         | 3s         | 10s     | More generous for high load         |
| Health check start period    | 5s         | 30s     | Allow longer initialization         |
| Log max-size (server)        | 10m        | 20m     | More verbose logging for debugging  |
| Log max-file (server)        | 3          | 5       | Keep more history for investigation |

## Deployment Steps

### 1. Prerequisites

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### 2. Build Images

From the automaker repository:

```bash
# Build server image
docker build -f Dockerfile --target server -t automaker-server:staging .

# Build UI image
docker build -f Dockerfile --target ui -t automaker-ui:staging .

# Verify images
docker images | grep automaker
```

### 3. Configure Environment

Create `.env.staging`:

```bash
# API Keys
ANTHROPIC_API_KEY=your_anthropic_key
LINEAR_API_KEY=your_linear_key
DISCORD_BOT_TOKEN=your_discord_token
AUTOMAKER_API_KEY=automaker-staging-key-2026

# Paths
PROJECTS_DIR=/path/to/your/projects
```

### 4. Start Services

```bash
# Start with staging config
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d

# Watch logs
docker compose -f docker-compose.staging.yml logs -f

# Verify health
curl http://localhost:3008/api/health
```

### 5. Verify Agent Capacity

Test concurrent agent execution:

```bash
# Access server container
docker exec -it automaker-server-staging bash

# Check memory available
free -h

# Monitor resource usage during agent execution
docker stats automaker-server-staging
```

## Auto-Mode Configuration

For high-concurrency staging, configure auto-mode settings per project:

### Global Settings (`DATA_DIR/settings.json`)

```json
{
  "version": 3,
  "autoMode": {
    "maxConcurrency": 8,
    "verifyBeforeMerge": true,
    "autoCommit": false,
    "autoPush": false
  }
}
```

### Per-Project Settings (`.automaker/settings.json`)

Override for specific projects:

```json
{
  "version": 2,
  "autoMode": {
    "maxConcurrency": 6,
    "useWorktrees": true
  }
}
```

### Complexity-Based Concurrency

Adjust max concurrency based on feature complexity distribution:

```javascript
// For small features (haiku): up to 10 concurrent
{
  "autoMode": {
    "maxConcurrency": 10
  }
}

// For mixed medium/large (sonnet): 6-8 concurrent
{
  "autoMode": {
    "maxConcurrency": 7
  }
}

// For architectural work (opus): 4-6 concurrent
{
  "autoMode": {
    "maxConcurrency": 5
  }
}
```

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

# I/O stats
docker exec automaker-server-staging iostat -x 5

# If high I/O wait:
# - Use SSD storage
# - Check for excessive logging
# - Review worktree cleanup
```

## Troubleshooting

### Server Crashes Under Load

**Symptoms:**

- Container exits with code 137 (OOM kill)
- Logs show "Killed" or heap errors
- Dashboard shows agents stuck in "running" state

**Solutions:**

1. Check actual memory usage:

   ```bash
   docker stats automaker-server-staging
   ```

2. Reduce concurrency:

   ```json
   {
     "autoMode": {
       "maxConcurrency": 4
     }
   }
   ```

3. Increase memory limit (if hardware allows):

   ```yaml
   deploy:
     resources:
       limits:
         memory: 64G
   ```

4. Review feature complexity distribution - move architectural work to separate queue

### Slow Agent Performance

**Symptoms:**

- Agents take much longer than expected
- High CPU but low memory usage
- Logs show "waiting for API response"

**Solutions:**

1. Check network latency to Anthropic API:

   ```bash
   docker exec automaker-server-staging curl -w "@curl-format.txt" -o /dev/null -s https://api.anthropic.com
   ```

2. Review MCP tool usage - heavy Linear/Discord queries can slow agents

3. Check for context file bloat:
   ```bash
   # Context files over 100KB may slow agents
   find /projects/*/.automaker/context -type f -size +100k
   ```

### Docker Volume Issues

**Symptoms:**

- "No space left on device"
- Slow file operations
- Container restart failures

**Solutions:**

1. Check volume usage:

   ```bash
   docker system df -v
   ```

2. Clean up unused resources:

   ```bash
   docker system prune -a --volumes
   ```

3. Review data directory size:
   ```bash
   docker exec automaker-server-staging du -sh /data/*
   ```

## Environment Variable Troubleshooting

### Adding a New Env Var to Staging

To permanently add a new environment variable:

1. **Add to `.env`** at `/home/josh/staging-deploy/automaker/.env`
2. **Add to `docker-compose.staging.yml`** in the `server.environment` section with the pattern `- VAR_NAME=${VAR_NAME:-}`
3. **Recreate the container** — env vars are only read at container creation, not on restart:

```bash
cd /home/josh/staging-deploy/automaker
docker stop automaker-server && docker rm automaker-server
docker compose -p automaker-staging -f docker-compose.staging.yml up -d server --no-deps
```

### Verifying Env Vars in Container

```bash
# Check if a specific variable is set
docker exec automaker-server env | grep VAR_NAME

# List all env vars
docker exec automaker-server env | sort
```

### Common Issues

**Env var not appearing after restart:**

Docker compose only reads env vars at container _creation_ time. A `docker restart` or `docker compose restart` does NOT re-read `.env`. You must stop, remove, and recreate the container (see above).

**Compose project name mismatch:**

The staging compose file has `name: automaker-staging`. If you run `docker compose` from a different directory context, it may use the directory name as project name instead, creating orphaned containers. Always use `-p automaker-staging` when running docker compose commands manually.

**Container name conflict:**

```text
Error: container name "/automaker-server" is already in use
```

An old container from a different compose context still exists. Fix:

```bash
docker stop automaker-server && docker rm automaker-server
```

### Linear API Key (`LINEAR_API_KEY`)

Linear's API requires different `Authorization` header formats depending on the token type:

- **API keys** (start with `lin_api_`): Pass directly — `Authorization: lin_api_...`
- **OAuth tokens**: Use Bearer prefix — `Authorization: Bearer <token>`

The `LinearMCPClient.executeGraphQL()` method detects the token type automatically. If you see `400 Bad Request` errors from Linear, verify:

1. The env var is set: `docker exec automaker-server env | grep LINEAR`
2. The token format is correct (should start with `lin_api_`)
3. The token is valid (test directly):

```bash
curl -s https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query":"{ viewer { id name } }"}' | python3 -m json.tool
```

### protoMaker API Key (`AUTOMAKER_API_KEY`)

protoMaker uses `X-API-Key` header (NOT `Authorization: Bearer`):

```bash
# Correct
curl http://localhost:3008/api/health -H "X-API-Key: $AUTOMAKER_API_KEY"

# Wrong — will return 401
curl http://localhost:3008/api/health -H "Authorization: Bearer $AUTOMAKER_API_KEY"
```

## Backup & Recovery

### Critical Data Locations

- **Feature data**: `/data/` volume (Docker volume: `automaker-data`)
- **Claude config**: `/home/automaker/.claude` volume
- **Cursor config**: `/home/automaker/.cursor` volume
- **Project worktrees**: In each project's `.worktrees/` directory

### Backup Strategy

```bash
# Stop services
docker compose -f docker-compose.staging.yml down

# Backup volumes
docker run --rm \
  -v automaker-data:/data:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/automaker-data-$(date +%Y%m%d).tar.gz -C /data .

# Backup projects
tar czf backups/projects-$(date +%Y%m%d).tar.gz /path/to/projects

# Restart services
docker compose -f docker-compose.staging.yml up -d
```

### Recovery

```bash
# Stop services
docker compose -f docker-compose.staging.yml down

# Restore data volume
docker run --rm \
  -v automaker-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar xzf /backup/automaker-data-20260207.tar.gz -C /data

# Restart services
docker compose -f docker-compose.staging.yml up -d
```

## Scaling Considerations

### Horizontal Scaling (Future)

Current architecture uses single-container deployment. For true horizontal scaling:

1. **Separate stateless API from stateful agent execution**
   - API servers: load-balanced, replicated
   - Agent workers: dedicated instances with high memory

2. **Shared state via external store**
   - Redis for queue management
   - PostgreSQL for persistent storage
   - S3/object storage for artifacts

3. **Queue-based agent distribution**
   - RabbitMQ or Redis queues
   - Worker nodes pull from queue
   - Result aggregation service

### Vertical Scaling (Current Approach)

Staging uses vertical scaling - increase resources on single host:

- 48GB → 64GB → 96GB RAM
- 8 → 12 → 16 CPU cores
- Adjust `maxConcurrency` proportionally

**Rule of thumb:** 6GB RAM per concurrent agent (mixed complexity)

## Differences from Production

| Aspect           | Production            | Staging                   | Reason                      |
| ---------------- | --------------------- | ------------------------- | --------------------------- |
| Memory           | 16GB (2×8G replicas)  | 48GB (single instance)    | High concurrency testing    |
| Max Concurrency  | 2-3 agents            | 6-8 agents                | Stress testing              |
| Auto-push        | Enabled               | Disabled (manual)         | Safety - review before push |
| Error Tolerance  | Low (fail fast)       | High (retry with logging) | Debugging & investigation   |
| Monitoring       | Basic health checks   | Verbose logging + metrics | Observability               |
| Backup Frequency | Daily                 | On-demand                 | Less critical data          |
| Security         | Strict (secrets mgmt) | Relaxed (env vars)        | Convenience vs security     |

## Best Practices

1. **Start with lower concurrency** - Begin with `maxConcurrency: 4` and increase gradually
2. **Monitor memory trends** - Track peak usage over time before increasing load
3. **Use complexity appropriately** - Mark features correctly (small/medium/large/architectural)
4. **Set feature-level `maxTurns`** - Override for specific long-running features
5. **Keep context files lean** - Large context slows agents and increases memory
6. **Clean up worktrees regularly** - Remove merged/stale worktrees to free disk space
7. **Test with mixed complexity** - Don't run all architectural features at once
8. **Use Discord/Linear integrations** - Async notifications reduce need for polling

## Support & Debugging

### Useful Commands

```bash
# Quick health check
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.staging.yml logs --tail=50 server

# Memory deep dive
docker exec automaker-server-staging cat /proc/meminfo
docker exec automaker-server-staging node --v8-options | grep -i heap

# Network diagnostics
docker exec automaker-server-staging curl -v http://localhost:3008/api/health
docker network inspect automaker_default

# Process tree
docker exec automaker-server-staging pstree -p

# Open files (check for leaks)
docker exec automaker-server-staging lsof | wc -l
```

### Enable Debug Logging

Add to `docker-compose.staging.yml`:

```yaml
environment:
  - LOG_LEVEL=debug
  - DEBUG=automaker:*
```

### Report Issues

When reporting staging issues, include:

1. Memory usage at time of issue (`docker stats` output)
2. Container logs (`docker compose logs`)
3. Number of concurrent agents running
4. Feature complexity distribution
5. Uptime since last restart

## Automated Deploys

Staging auto-deploys from `main` via a GitHub Actions self-hosted runner.

### How It Works

1. Code merges to `main`
2. `.github/workflows/deploy-staging.yml` triggers on the self-hosted runner
3. Workflow clones/pulls into a **persistent deploy directory** (`/home/josh/staging-deploy/automaker`) — not the runner's `_work/` workspace (which gets cleaned by cron)
4. `.env` is copied from `/home/josh/dev/ava/.env` (persistent credentials)
5. **Drain step** calls `POST /api/deploy/drain` to gracefully stop auto-mode and wait for running agents to finish (up to 2 minutes, then force-stops)
6. `setup-staging.sh --build` builds all Docker images (server, UI, docs, storybook), `--start` restarts containers
7. On startup, auto-mode auto-resumes from `autoModeAlwaysOn` settings and orphaned features are reset to `backlog`
8. Health check verifies deployment, smoke tests run
9. Discord notification posted to `#deployments`

### Zero-Downtime Deploy (Agent Drain)

Previous deploys killed running agents by restarting Docker containers immediately. The drain system prevents this:

```
push to main → drain API → agents finish/stop → build → restart → auto-resume
```

**Drain endpoint:** `POST /api/deploy/drain`

- Stops auto-mode for all active worktrees (prevents new agents)
- Polls every 5s for running agents to finish (up to 2 min timeout)
- Force-stops any agents still running after timeout
- Returns `{ success, drained, worktreesStopped, agentsForceStopped, elapsedSeconds }`

**Status endpoint:** `GET /api/deploy/status`

- Returns `{ drainInProgress, runningAgents, activeWorktrees }`

**Manual drain:**

```bash
# Via setup script
./scripts/setup-staging.sh --drain

# Via curl
curl -X POST http://localhost:3008/api/deploy/drain \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AUTOMAKER_API_KEY"
```

**Auto-resume:** The server automatically restarts auto-mode on startup using `autoModeAlwaysOn` settings. Features stuck in `in_progress` are reset to `backlog`.

### Setup

```bash
# Install the self-hosted runner on the staging machine
./scripts/setup-runner.sh

# Check runner status
./scripts/setup-runner.sh --status

# Remove runner
./scripts/setup-runner.sh --uninstall
```

### Manual Deploy

```bash
# Pull latest and rebuild
git pull origin main
./scripts/setup-staging.sh --build
./scripts/setup-staging.sh --start
```

### Discord Notifications

Set the `DISCORD_DEPLOY_WEBHOOK` secret in GitHub repo settings to receive deploy notifications in `#deployments`.

## CD Pipeline Troubleshooting

### Workspace Deleted Mid-Build

**Symptoms:**

- Docker build starts but fails with `Couldn't find env file` or `No such file or directory`
- Server image builds fine but UI image fails
- Cleanup steps show "working directory does not exist"

**Cause:** The self-hosted runner's workspace cleanup cron (every 5min) deletes the `_work/` directory during long Docker builds. Multiple workflows sharing the same runner can also interfere via `actions/checkout` with `clean: true`.

**Fix:** The deploy workflow now uses a persistent directory (`/home/josh/staging-deploy/automaker`) instead of the runner workspace. Env vars are sourced into the shell via `set -a` so docker compose doesn't need `--env-file`.

### Docker Build Fails on `build:packages`

**Symptoms:**

- Build gets past `Pull latest code` but fails during `Rebuild and restart staging`
- Logs show: `error TS5058: The specified path does not exist: 'packages/mcp-server/tsconfig.json'`

**Cause:** The `build:packages` script includes `tsc --project packages/mcp-server/tsconfig.json`, but `packages/` is not copied into the Docker build context (only `libs/` and `apps/` are).

**Fix:** The Dockerfile uses `npm run build:libs` instead of `build:packages`. The `build:libs` script builds only the shared libraries needed inside the container. The `build:packages` script (used on the host) also builds the MCP server.

**Key distinction:**

- `build:libs` — shared libraries only (for Docker builds)
- `build:packages` — libs + MCP server (for host development)

### Runner Working Directory Missing

**Symptoms:**

- Steps that don't explicitly `cd` fail with: `An error occurred trying to start process '/usr/bin/bash' with working directory '<runner-path>/_work/automaker/automaker'`
- This especially affects `if: always()` steps like Cleanup and Notify Discord

**Cause:** GitHub Actions self-hosted runners create a `_work/{repo}/{repo}` directory as the default working directory. If this directory doesn't exist (e.g., the runner was set up without an initial checkout), steps that don't set their own working directory fail to start.

**Fix:** Set `defaults.run.working-directory` at the job level so all steps run from the correct directory regardless of the runner's default.

### Discord Notifications Silent

**Symptoms:**

- Deploy completes (success or failure) but no message appears in `#deployments`
- No errors in the Notify Discord step

**Cause:** The notification step checks `if [ -n "${DISCORD_DEPLOY_WEBHOOK:-}" ]` before sending. If the GitHub secret is not set, the condition silently skips.

**Required GitHub secrets** (Settings > Secrets and variables > Actions):

| Secret                   | Purpose                              | Channel      |
| ------------------------ | ------------------------------------ | ------------ |
| `DISCORD_DEPLOY_WEBHOOK` | Deploy success/failure notifications | #deployments |
| `DISCORD_ALERTS_WEBHOOK` | Smoke test failure alerts            | #deployments |

Create webhooks in Discord: Server Settings > Integrations > Webhooks > New Webhook, target the `#deployments` channel.

## Next Steps

After staging deployment is stable:

1. Document capacity limits observed (agents per complexity)
2. Tune `maxConcurrency` based on actual usage patterns
3. Set up automated monitoring/alerting
4. Plan production rollout with learned optimizations
5. Consider dedicated agent worker architecture for >10 concurrent agents

---

**Applies to:** protoMaker v1.x with Docker deployment
