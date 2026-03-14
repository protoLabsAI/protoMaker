# High-Concurrency Deployment

This guide covers deploying protoLabs in a staging or high-concurrency environment with high-memory configuration for increased concurrent agent capacity.

## Overview

The staging server is optimized for:

- **Concurrent Agent Execution**: 6-10 agents running simultaneously (vs 2-3 in standard production)
- **High Memory Allocation**: 48GB RAM dedicated to agent workloads
- **Development Testing**: Safe environment for testing features before production release
- **Multi-Project Support**: Can work on multiple projects including automaker itself without conflicts
- **Full Service Suite**: UI (3007), API (3008), Docs (3009) — docs runs independently via `docker-compose.docs.yml`

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
- MCP tool usage (Discord, etc.)
- Conversation history length

### Known Limits

- **13+ concurrent agents = server crash** (confirmed from production incidents)
- Recommended max concurrency: **8 agents** for stable operation with mixed complexity
- Use `maxConcurrency` setting in auto-mode to enforce limits

## Project Isolation

**Important:** Multiple projects with the same name can coexist without conflicts.

protoLabs isolates projects by **absolute path**, not by name. Each project's data is stored in `{projectPath}/.automaker/`.

Example - no conflicts:

```
/home/automaker/automaker/.automaker/       # Staging server's own codebase
/projects/customer-automaker/.automaker/    # Customer project being worked on
/mnt/dev/automaker/.automaker/             # Another automaker instance
```

## Docker Compose Configuration

### Service Architecture

Staging uses **two separate compose files** for independent lifecycles:

| File                         | Services   | Project Name        | Purpose                           |
| ---------------------------- | ---------- | ------------------- | --------------------------------- |
| `docker-compose.staging.yml` | server, ui | `automaker-staging` | App services (restart together)   |
| `docker-compose.docs.yml`    | docs       | `automaker-docs`    | Docs site (survives app restarts) |

This separation means app deploys and rollbacks never touch the docs container. A docs build failure also does not abort the app deploy.

### App Services (`docker-compose.staging.yml`)

The staging compose configures server and UI with high-memory resources:

- **Server**: `on-failure:5` restart policy (stops after 5 consecutive crashes instead of looping forever), 48GB memory limit, `GIT_COMMIT_SHA` build arg for version tracking
- **UI**: `unless-stopped` restart policy, depends on server health, 2GB memory limit
- **Volumes**: All marked `external: true` — created by `setup-staging.sh` on first run

### Docs Site (`docker-compose.docs.yml`)

Lightweight VitePress docs container running independently:

- 128MB memory limit, nginx:alpine serving static files
- `unless-stopped` restart policy (nginx rarely crashes)
- Port configurable via `DOCS_PORT` env var (default: 3009)

### Key Configuration Changes from Production

| Setting                      | Production       | Staging          | Reason                              |
| ---------------------------- | ---------------- | ---------------- | ----------------------------------- |
| Memory limit                 | 8G               | 48G              | Support 6-10 concurrent agents      |
| CPU limit                    | 2                | 8                | Parallel agent execution            |
| `NODE_OPTIONS` max-old-space | default          | 32768            | Prevent Node.js heap exhaustion     |
| Server restart policy        | `unless-stopped` | `on-failure:5`   | Stop crash loops after 5 retries    |
| Health check timeout         | 3s               | 10s              | More generous for high load         |
| Health check start period    | 5s               | 60s              | Allow longer initialization         |
| Log max-size (server)        | 10m              | 100m             | More verbose logging for debugging  |
| Log max-file (server)        | 3                | 10               | Keep more history for investigation |
| Docs lifecycle               | Same compose     | Separate compose | Independent deploys and rollbacks   |

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

The staging deploy uses a **dedicated** `.env.staging` file at `/home/deploy/staging/.env.staging` — separate from the dev `.env` to prevent accidental breakage. The deploy workflow copies this into the deploy directory as `.env` on each run.

Create `.env.staging`:

```bash
# API Keys
ANTHROPIC_API_KEY=your_anthropic_key
AUTOMAKER_API_KEY=automaker-staging-key-2026

# Container User
UID=1000
GID=1000

# Paths
PROJECTS_MOUNT=/home/youruser/dev
LABS_MOUNT=/home/youruser/labs
ALLOWED_ROOT_DIRECTORY=/home/youruser/dev

# Resources (auto-detected by setup-staging.sh if omitted)
MEMORY_LIMIT=48G
CPU_LIMIT=8
NODE_MAX_OLD_SPACE=32768
AUTOMAKER_MAX_CONCURRENCY=6
```

### 4. Start Services

```bash
# One-command setup (recommended)
./scripts/setup-staging.sh

# Or step by step:
./scripts/setup-staging.sh --build    # Build images
./scripts/setup-staging.sh --start    # Start containers

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
    "maxConcurrency": 8,
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

See [High-Concurrency Tuning](./high-concurrency-tuning.md) for monitoring, performance tuning, troubleshooting, and CI/CD pipeline details.
