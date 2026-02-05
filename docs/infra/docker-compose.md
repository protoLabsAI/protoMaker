# Docker Compose Configuration

Automaker provides multiple Docker Compose configurations for different use cases.

## Compose Files

| File                          | Purpose              | Isolation Level                     |
| ----------------------------- | -------------------- | ----------------------------------- |
| `docker-compose.yml`          | Production (default) | Full isolation - named volumes only |
| `docker-compose.dev.yml`      | Development          | Source mounted, live reload         |
| `docker-compose.override.yml` | Local customization  | User-defined (gitignored)           |

## Production Configuration

`docker-compose.yml` runs Automaker in complete isolation:

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
      - /home/josh/dev:/home/josh/dev:rw
    environment:
      - ALLOWED_ROOT_DIRECTORY=/home/josh/dev
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

| Variable            | Description                                                    |
| ------------------- | -------------------------------------------------------------- |
| `AUTOMAKER_API_KEY` | API key for Automaker authentication (auto-generated if blank) |
| `CURSOR_AUTH_TOKEN` | Cursor CLI OAuth token                                         |
| `GH_TOKEN`          | GitHub CLI token for git operations                            |

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
┌─────────────────────────────────────────┐
│           Docker Network                 │
│                                          │
│  ┌─────────┐        ┌─────────┐         │
│  │   ui    │───────▶│ server  │         │
│  │  :80    │  http  │  :3008  │         │
│  └────┬────┘        └────┬────┘         │
│       │                  │               │
└───────┼──────────────────┼───────────────┘
        │                  │
   localhost:3007    localhost:3008
```

The UI container uses `http://server:3008` internally, while external access uses `localhost:3008`.
