# Docker Production Setup - Handoff Document

This document captures the changes made to enable Docker deployment with Claude subscription and GitHub CLI authentication.

## Changes Made

### 1. Missing Dependencies Fixed

**`apps/ui/package.json`** - Added `zod` dependency (used by TanStack Router for search validation)

**`libs/spec-parser/package.json`** - Added `fast-xml-parser` dependency

### 2. Dockerfile Updates

**`Dockerfile`** - Two changes:

1. Added `libs/spec-parser/package*.json` to the COPY commands (was missing, caused build failure)
2. Changed `VITE_SERVER_URL` default from `http://localhost:3008` to `""` (empty string)
   - This allows the UI to use relative URLs in production
   - Nginx proxies `/api/*` requests to the backend server

### 3. Nginx Proxy Configuration

**`apps/ui/nginx.conf`** - Added proxy configuration for API requests:

```nginx
location /api {
    proxy_pass http://server:3008;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # ... additional headers for WebSocket support
}
```

This allows the UI container to forward API and WebSocket requests to the server container.

### 4. GitHub Token Support

**`docker-compose.yml`** - Added `GH_TOKEN` environment variable for GitHub CLI authentication:

```yaml
- GH_TOKEN=${GH_TOKEN:-}
```

---

## Production Deployment (Proxmox/Linux Server)

### Prerequisites

- Docker and Docker Compose installed
- Git repository cloned

### Step 1: Create `.env` file

```bash
# Claude subscription auth (extract on Mac with: ./scripts/get-claude-token.sh)
CLAUDE_OAUTH_CREDENTIALS='{"claudeAiOauth":{"accessToken":"...","refreshToken":"...","expiresAt":...}}'

# GitHub CLI token (get with: gh auth token)
GH_TOKEN=ghp_xxxxxxxxxxxx

# Optional: Fixed API key for web login (otherwise generates random one each restart)
AUTOMAKER_API_KEY=your-chosen-password

# Standard config
PORT=3008
DATA_DIR=./data
```

### Step 2: Build and Run

```bash
docker compose up --build -d
```

### Step 3: Access

- **UI:** http://your-server:3007
- **API:** http://your-server:3008

Login with the `AUTOMAKER_API_KEY` you set (or check `docker logs automaker-server` for the generated key).

---

## Proxmox VM Specifications

### Recommended Specs by Use Case

| Use Case      | Disk      | RAM   | vCPU | Notes                                   |
| ------------- | --------- | ----- | ---- | --------------------------------------- |
| **Minimum**   | 25 GB     | 4 GB  | 2    | Evaluation only, expect slowness        |
| **Baseline**  | 40 GB     | 8 GB  | 4    | Most users, comfortable operation       |
| **Heavy Use** | 80-120 GB | 16 GB | 6-8  | Multiple concurrent agents, large repos |

### Heavy Use Breakdown (Recommended)

**Disk (100 GB recommended):**

- OS: 6-8 GB
- Docker images & layers: 10-20 GB
- Automaker workspace/repos/logs: 20-40 GB
- Git worktrees (per feature): accumulates over time
- Headroom: 20+ GB

**Memory (16 GB recommended):**

- Node.js server: 512 MB - 2 GB
- Docker overhead: 1-2 GB
- Each agent process: 1-3 GB
- Git operations & test runs: variable spikes
- Running 2-3 agents concurrently can hit 10-12 GB

**CPU (6 vCPUs recommended):**

- Agent orchestration benefits from parallelism
- Builds and tests spike CPU
- Claude SDK spawns subprocesses

### Proxmox-Specific Settings

**Storage:**

- Use thin provisioning if available
- Use `virtio-scsi` with discard enabled
- Enable TRIM in guest OS

**Memory:**

- Do NOT overcommit RAM
- Disable ballooning (Node.js + Docker perform poorly with it)

**CPU:**

- Set CPU type to `host`
- Enable NUMA only if >= 16 GB RAM

**Swap (important for agent spikes):**

```bash
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Docker log rotation (prevents disk bloat):**

```bash
sudo mkdir -p /etc/docker
cat << 'EOF' | sudo tee /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
sudo systemctl restart docker
```

**Periodic maintenance:**

```bash
# Clean up old git worktrees
git worktree prune

# Clean up Docker
docker system prune -f
```

### Recommended Distro

Ubuntu 22.04 LTS or Debian 12 - both have excellent Docker support.

---

## Extracting Authentication Tokens

### Claude OAuth (Mac Only)

Requires being logged into Claude Code CLI (`claude login`):

```bash
./scripts/get-claude-token.sh
```

Copy the full JSON output to `CLAUDE_OAUTH_CREDENTIALS` in your `.env`.

**Note:** OAuth tokens expire. Re-extract and update if Claude auth stops working.

### GitHub Token

```bash
gh auth token
```

Or create a Personal Access Token at https://github.com/settings/tokens with `repo` scope.

---

## Local Development (Alternative to Docker)

If you want to use your Mac's existing Claude CLI auth without extracting tokens:

```bash
npm install
npm run build:packages
npm run dev:web          # Terminal 1: UI on :3007
npm run dev --workspace=apps/server  # Terminal 2: Server on :3008
```

This uses your host machine's Claude CLI authentication directly.

---

## Troubleshooting

### "Server Unavailable" in Browser

1. Hard refresh (`Cmd+Shift+R`) to clear cached JavaScript
2. Check nginx proxy: `curl http://localhost:3007/api/health`
3. Check server directly: `curl http://localhost:3008/api/health`

### "CLI authentication failed"

- Docker can't access host machine's Claude CLI credentials
- Set `CLAUDE_OAUTH_CREDENTIALS` or `ANTHROPIC_API_KEY` in `.env`

### Build Failures

```bash
# Clean rebuild
docker compose down
docker compose build --no-cache
docker compose up -d
```
