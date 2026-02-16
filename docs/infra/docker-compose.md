# Docker Compose Configuration

protoMaker provides multiple Docker Compose configurations for different use cases.

## Compose Files

| File                          | Purpose                    | Isolation Level                             |
| ----------------------------- | -------------------------- | ------------------------------------------- |
| `docker-compose.yml`          | Production (default)       | Full isolation - named volumes only         |
| `docker-compose.dev.yml`      | Development                | Source mounted, live reload                 |
| `docker-compose.prod.yml`     | Production (hardened)      | Docker secrets, Prometheus, Grafana         |
| `docker-compose.staging.yml`  | Staging (high-concurrency) | Host paths mounted for MCP compat           |
| `docker-compose.docs.yml`     | Docs site (independent)    | Standalone lifecycle, survives app restarts |
| `docker-compose.override.yml` | Local customization        | User-defined (gitignored)                   |

## Production Configuration

`docker-compose.yml` runs protoMaker in complete isolation:

```yaml
services:
  ui:
    build:
      context: .
      dockerfile: Dockerfile
      target: ui
    container_name: automaker-ui
    restart: unless-stopped
    ports:
      - '3007:80'
    depends_on:
      - server

  server:
    build:
      context: .
      dockerfile: Dockerfile
      target: server
      args:
        UID: ${UID:-1001}
        GID: ${GID:-1001}
    container_name: automaker-server
    restart: unless-stopped
    ports:
      - '3008:3008'
    environment:
      # See Environment Variables section
    volumes:
      - automaker-data:/data
      - automaker-claude-config:/home/automaker/.claude
      - automaker-cursor-config:/home/automaker/.cursor
      - automaker-opencode-data:/home/automaker/.local/share/opencode
      - automaker-opencode-config:/home/automaker/.config/opencode
      - automaker-opencode-cache:/home/automaker/.cache/opencode

  docs:
    build:
      context: .
      dockerfile: Dockerfile
      target: docs
    container_name: automaker-docs
    restart: unless-stopped
    ports:
      - '3009:80'
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:80/']
      interval: 30s
      timeout: 3s
      retries: 3

volumes:
  automaker-data:
  automaker-claude-config:
  automaker-cursor-config:
  automaker-opencode-data:
  automaker-opencode-config:
  automaker-opencode-cache:
```

### Key Features

- **Full isolation**: No host filesystem access
- **Named volumes**: Data persists across restarts but is Docker-managed
- **Non-root user**: Server runs as `automaker` user
- **Restart policy**: `unless-stopped` for automatic recovery
- **Docs site**: VitePress docs built as static files, served by nginx

## Development Configuration

`docker-compose.dev.yml` mounts source code for live reload:

```yaml
services:
  server:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: automaker-dev-server
    ports:
      - '3008:3008'
    environment:
      - NODE_ENV=development
      - HUSKY=0
    volumes:
      - .:/app:cached # Source code
      - automaker-dev-node-modules:/app/node_modules # Isolated node_modules
      - ./data:/data # Local data directory
    entrypoint: /bin/sh
    command:
      - -c
      - |
        npm ci --legacy-peer-deps --force &&
        npm run build:packages &&
        chown -R automaker:automaker /app/node_modules &&
        exec gosu automaker npm run _dev:server
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3008/api/health']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s

  ui:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: automaker-dev-ui
    ports:
      - '3007:3007'
    environment:
      - VITE_SERVER_URL=http://localhost:3008
      - VITE_SKIP_ELECTRON=true
    volumes:
      - .:/app:cached
      - automaker-dev-node-modules:/app/node_modules
    depends_on:
      server:
        condition: service_healthy
    command:
      - -c
      - |
        exec gosu automaker sh -c "
          while [ ! -d /app/node_modules/.bin ]; do sleep 2; done &&
          cd /app/apps/ui && npx vite --host
        "
```

### Key Features

- **Source mounting**: Changes are instantly reflected
- **Shared node_modules volume**: Avoids platform conflicts
- **Health check dependency**: UI waits for server
- **Vite HMR**: Hot module replacement enabled

## Override Configuration

Create `docker-compose.override.yml` for local customization (gitignored):

```yaml
# Example: Mount host projects directory
services:
  server:
    volumes:
      - /path/to/projects:/path/to/projects:rw
    environment:
      - ALLOWED_ROOT_DIRECTORY=/path/to/projects
```

Docker Compose automatically merges this with the base configuration.

### Common Override Patterns

#### Mount Host Projects

```yaml
services:
  server:
    volumes:
      - /path/to/projects:/path/to/projects:rw
    environment:
      - ALLOWED_ROOT_DIRECTORY=/path/to/projects
```

**Important**: Container paths MUST match host paths for the MCP plugin to work correctly.

#### Custom API Key

```yaml
services:
  server:
    environment:
      - AUTOMAKER_API_KEY=my-custom-key
```

#### GitHub Token

```yaml
services:
  server:
    environment:
      - GH_TOKEN=ghp_xxxxxxxxxxxxx
```

## Environment Variables

### Required (at least one)

| Variable                   | Description                                 |
| -------------------------- | ------------------------------------------- |
| `ANTHROPIC_API_KEY`        | Anthropic API key for Claude models         |
| `CLAUDE_OAUTH_CREDENTIALS` | Claude CLI OAuth JSON (from macOS Keychain) |

### Optional Authentication

| Variable            | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `AUTOMAKER_API_KEY` | API key for protoMaker authentication (auto-generated if blank) |
| `CURSOR_AUTH_TOKEN` | Cursor CLI OAuth token                                          |
| `GH_TOKEN`          | GitHub CLI token for git operations                             |

### Optional Configuration

| Variable                 | Default                 | Description                                |
| ------------------------ | ----------------------- | ------------------------------------------ |
| `PORT`                   | `3008`                  | Server port                                |
| `DATA_DIR`               | `/data`                 | Data storage directory                     |
| `ALLOWED_ROOT_DIRECTORY` | `/projects`             | Restrict file operations to this directory |
| `CORS_ORIGIN`            | `http://localhost:3007` | Allowed CORS origin                        |
| `IS_CONTAINERIZED`       | `true`                  | Indicates containerized environment        |

## Volumes

### Production Volumes

| Volume                      | Container Path                          | Purpose                        |
| --------------------------- | --------------------------------------- | ------------------------------ |
| `automaker-data`            | `/data`                                 | Sessions, settings, agent data |
| `automaker-claude-config`   | `/home/automaker/.claude`               | Claude CLI OAuth               |
| `automaker-cursor-config`   | `/home/automaker/.cursor`               | Cursor CLI config              |
| `automaker-opencode-data`   | `/home/automaker/.local/share/opencode` | OpenCode data                  |
| `automaker-opencode-config` | `/home/automaker/.config/opencode`      | OpenCode config                |
| `automaker-opencode-cache`  | `/home/automaker/.cache/opencode`       | OpenCode cache                 |

### Development Volumes

| Volume                       | Container Path      | Purpose                           |
| ---------------------------- | ------------------- | --------------------------------- |
| `automaker-dev-node-modules` | `/app/node_modules` | Container-specific dependencies   |
| `./data`                     | `/data`             | Local data (shared with Electron) |

## Usage

### Start Production

```bash
docker compose up -d
```

### Start Development

```bash
docker compose -f docker-compose.dev.yml up
```

### View Logs

```bash
docker compose logs -f
docker compose logs -f server
docker compose logs -f ui
```

### Rebuild After Changes

```bash
docker compose build --no-cache
docker compose up -d
```

### Stop Services

```bash
docker compose down
```

### Stop and Remove Volumes

```bash
docker compose down -v
```

## Health Checks

The server container includes a health check:

```yaml
healthcheck:
  test: ['CMD', 'curl', '-f', 'http://localhost:3008/api/health']
  interval: 30s
  timeout: 3s
  start_period: 5s
  retries: 3
```

Check health status:

```bash
docker compose ps
docker inspect automaker-server --format '{{.State.Health.Status}}'
```

## Networking

Services communicate via Docker's internal network:

```
┌──────────────────────────────────────────────────────┐
│                  Docker Network                       │
│                                                       │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐          │
│  │   ui    │───▶│ server  │    │  docs   │          │
│  │  :80    │http│  :3008  │    │  :80    │          │
│  └────┬────┘    └────┬────┘    └────┬────┘          │
│       │              │              │                │
└───────┼──────────────┼──────────────┼────────────────┘
        │              │              │
   localhost:3007 localhost:3008 localhost:3009
```

The UI container uses `http://server:3008` internally, while the docs container serves the VitePress site independently. External access uses `localhost` on the mapped ports.

## Docs Isolation (Staging)

In staging, the docs site runs via a separate compose file (`docker-compose.docs.yml`) with its own project name (`automaker-docs`). This gives docs a completely independent lifecycle from the app services:

- App deploys (server + UI rebuild/restart) do not touch docs
- App rollbacks only affect server + UI containers
- Docs can be restarted independently without affecting the app
- A docs build failure does not abort the app deploy

```bash
# Manage docs independently
docker compose -f docker-compose.docs.yml up -d
docker compose -f docker-compose.docs.yml logs -f
docker compose -f docker-compose.docs.yml down

# App services are separate
docker compose -f docker-compose.staging.yml up -d server ui
```

The `setup-staging.sh` script handles both compose files automatically.
