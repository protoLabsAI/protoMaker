# Docker Architecture

Automaker uses a multi-stage Dockerfile to build both server and UI images from a single file.

## Files

| File                   | Purpose                            |
| ---------------------- | ---------------------------------- |
| `Dockerfile`           | Production multi-stage build       |
| `Dockerfile.dev`       | Development build with live reload |
| `docker-entrypoint.sh` | Container initialization script    |

## Multi-Stage Build

The production `Dockerfile` defines multiple stages:

```
┌─────────────────────────────────────────────────────────────┐
│                        Dockerfile                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐                                               │
│  │   base   │  Common setup: Node 22, build tools           │
│  └────┬─────┘                                               │
│       │                                                      │
│  ┌────┴──────────────┬──────────────────┐                   │
│  │                   │                  │                    │
│  ▼                   ▼                  │                    │
│  ┌──────────────┐   ┌──────────────┐    │                   │
│  │server-builder│   │  ui-builder  │    │                   │
│  │  Build libs  │   │  Build libs  │    │                   │
│  │ Build server │   │   Build UI   │    │                   │
│  └──────┬───────┘   └──────┬───────┘    │                   │
│         │                  │            │                    │
│         ▼                  ▼            │                    │
│  ┌──────────────┐   ┌──────────────┐    │                   │
│  │    server    │   │      ui      │    │                   │
│  │  Node.js     │   │    nginx     │    │                   │
│  │  Production  │   │   Static     │    │                   │
│  └──────────────┘   └──────────────┘    │                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Build Targets

### Server Target

```bash
docker build --target server -t automaker-server .
```

**Base image:** `node:22-slim`

**Includes:**

- Node.js runtime
- Git, curl, bash, gosu
- GitHub CLI (gh)
- Claude CLI (`@anthropic-ai/claude-code`)
- Cursor CLI (`cursor-agent`)
- OpenCode CLI
- Playwright browser dependencies

**Build args:**

- `UID` / `GID` - Match container user to host user (default: 1001)
- `GIT_COMMIT_SHA` - Track build source (for labels)

### UI Target

```bash
docker build --target ui -t automaker-ui .
```

**Base image:** `nginx:alpine`

**Includes:**

- Pre-built static files
- nginx configuration for SPA routing

**Build args:**

- `VITE_SERVER_URL` - API server URL (empty = relative URLs)
- `GIT_COMMIT_SHA` - Track build source

## Base Stage

The `base` stage is shared by both server and UI builders:

```dockerfile
FROM node:22-slim AS base

# Install build dependencies for native modules (node-pty)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files for npm workspace
COPY package*.json ./
COPY libs/*/package*.json ./libs/*/
COPY scripts ./scripts
```

## Server Production Stage

Key features of the server production image:

### Non-Root User

```dockerfile
ARG UID=1001
ARG GID=1001

RUN groupadd -o -g ${GID} automaker && \
    useradd -o -u ${UID} -g automaker -m -d /home/automaker -s /bin/bash automaker
```

The `-o` flag allows non-unique IDs (GID 1000 may already exist as 'node' group).

### CLI Tools

```dockerfile
# Claude CLI (global npm package)
RUN npm install -g @anthropic-ai/claude-code

# Cursor CLI (user-local installation)
USER automaker
RUN curl https://cursor.com/install -fsS | bash
USER root

# OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash
```

### Git Configuration

```dockerfile
# Safe directory for mounted volumes
RUN git config --system --add safe.directory '*' && \
    # Use gh as credential helper (works with GH_TOKEN)
    git config --system credential.helper '!gh auth git-credential'
```

### Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3008/api/health || exit 1
```

## Development Dockerfile

`Dockerfile.dev` is a simpler single-stage build for development:

```dockerfile
FROM node:22-slim

# Build tools + runtime tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    git curl bash gosu ca-certificates openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Same CLI installations as production...

WORKDIR /app
EXPOSE 3007 3008

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "dev:web"]
```

Key differences from production:

- Single stage (no build optimization)
- Both ports exposed (3007 + 3008)
- Source code mounted as volume, not copied
- Designed for `docker-compose.dev.yml`

## Entrypoint Script

`docker-entrypoint.sh` runs as root before switching to the automaker user:

```bash
#!/bin/sh
set -e

# Create CLI config directories
mkdir -p /home/automaker/.claude
mkdir -p /home/automaker/.cursor
mkdir -p /home/automaker/.local/share/opencode
mkdir -p /home/automaker/.config/opencode
mkdir -p /home/automaker/.cache/opencode
mkdir -p /home/automaker/.npm

# Write OAuth credentials from environment variables
if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
    echo "$CLAUDE_OAUTH_CREDENTIALS" > /home/automaker/.claude/.credentials.json
    chmod 600 /home/automaker/.claude/.credentials.json
fi

if [ -n "$CURSOR_AUTH_TOKEN" ]; then
    mkdir -p /home/automaker/.config/cursor
    echo "{\"accessToken\": \"$CURSOR_AUTH_TOKEN\"}" > /home/automaker/.config/cursor/auth.json
    chmod 600 /home/automaker/.config/cursor/auth.json
fi

# Fix permissions
chown -R automaker:automaker /home/automaker/.claude
chown -R automaker:automaker /home/automaker/.cursor
# ... other directories

# Switch to automaker user and run command
exec gosu automaker "$@"
```

## Building Images

### Build for Production

```bash
# Build both images
docker compose build

# Build with custom UID/GID
UID=$(id -u) GID=$(id -g) docker compose build

# Build with commit SHA label
docker build --target server \
  --build-arg GIT_COMMIT_SHA=$(git rev-parse HEAD) \
  -t automaker-server .
```

### Build for Development

```bash
docker compose -f docker-compose.dev.yml build
```

## Image Labels

The production images include a label for tracking the source commit:

```dockerfile
ARG GIT_COMMIT_SHA=unknown
LABEL automaker.git.commit.sha="${GIT_COMMIT_SHA}"
```

Query the label:

```bash
docker inspect automaker-server --format '{{ index .Config.Labels "automaker.git.commit.sha" }}'
```

## Platform Support

Both Dockerfiles support multi-architecture builds:

```bash
# AMD64 (x86_64)
docker build --platform linux/amd64 --target server -t automaker-server:amd64 .

# ARM64 (Apple Silicon, ARM servers)
docker build --platform linux/arm64 --target server -t automaker-server:arm64 .
```

The GitHub CLI installation handles architecture detection:

```dockerfile
ARCH=$(uname -m)
case "$ARCH" in
    x86_64) GH_ARCH="amd64" ;;
    aarch64|arm64) GH_ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH" && exit 1 ;;
esac
```
