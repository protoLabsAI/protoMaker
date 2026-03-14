# Deployment Guide

This guide covers different deployment options for protoLabs.

## Deployment Options

| Option                             | Best For                | Isolation    | Setup Complexity         |
| ---------------------------------- | ----------------------- | ------------ | ------------------------ |
| Local Development                  | Development             | None         | Low                      |
| Docker (Isolated)                  | Testing, demos          | Full         | Low                      |
| Docker (Projects Mounted)          | Personal use            | Partial      | Medium                   |
| systemd + Docker                   | Production server       | Configurable | Medium                   |
| [Staging](./staging-deployment.md) | High-concurrency agents | Partial      | Low (`setup-staging.sh`) |
| Cloudflare Pages                   | Landing page hosting    | Full         | Low                      |

## Landing Page (Cloudflare Pages)

The protoLabs.studio landing page (`site/index.html`) is deployed as a static site on Cloudflare Pages.

### Architecture

```
site/index.html → Cloudflare Pages → protolabs.studio
                   (300+ edge nodes, serverless)
```

No build step. Cloudflare serves the static HTML directly from the `site/` directory on the `main` branch.

### Cloudflare Pages Configuration

| Setting           | Value                   |
| ----------------- | ----------------------- |
| Project name      | `protolabs-studio`      |
| Repository        | `protoLabsAI/automaker` |
| Production branch | `main`                  |
| Root directory    | `site`                  |
| Build command     | _(none)_                |
| Build output      | `/`                     |
| Watch paths       | `site/**`               |

### Custom Domains

| Domain                 | Type  | Behavior                 |
| ---------------------- | ----- | ------------------------ |
| `protolabs.studio`     | Apex  | Primary (serves content) |
| `www.protolabs.studio` | CNAME | 301 redirect to apex     |

### Security & Performance

All configured in the `protolabs.studio` Cloudflare zone:

| Setting           | Value                                    |
| ----------------- | ---------------------------------------- |
| SSL mode          | Full (strict)                            |
| HSTS              | ON, max-age=31536000, include subdomains |
| Min TLS Version   | 1.2                                      |
| Bot Fight Mode    | Super Bot Fight Mode (Pro)               |
| Auto Minify       | HTML, CSS, JS                            |
| Brotli            | ON                                       |
| HTTP/3            | ON                                       |
| Always Online     | ON                                       |
| Browser Cache TTL | 4 hours                                  |
| Edge Cache TTL    | 1 day                                    |

### Newsletter Integration

The signup form posts directly to Buttondown (username: `protoLabsAI`). No server-side code or API keys required. Submissions are tagged `launch-list` for segmentation.

### Deployment Trigger

Merging to `main` with changes in `site/**` triggers an automatic Cloudflare Pages deploy. No CI configuration needed — Cloudflare watches the repo directly.

### Verification

```bash
curl -I https://protolabs.studio      # 200 + CF-Ray header
curl -I https://www.protolabs.studio   # 301 → apex
curl -I http://protolabs.studio        # redirect → HTTPS
```

## Local Development

For development, run protoLabs directly on your machine:

```bash
# Install dependencies
npm install

# Interactive launcher (choose web or electron)
npm run dev

# Or directly:
npm run dev:web       # Web browser at localhost:3007
npm run dev:electron  # Desktop app
```

### Requirements

- Node.js 22+
- Git
- npm

### Environment Variables

Create a `.env` file:

```bash
ANTHROPIC_API_KEY=sk-ant-xxx
AUTOMAKER_API_KEY=your-local-key
```

## Docker (Isolated)

Run protoLabs in complete isolation from your filesystem:

```bash
docker compose up -d
```

Access at `http://localhost:3007` (UI), `http://localhost:3008` (API), `http://localhost:3009` (Docs)

### Characteristics

- **No access to host files** - Only Docker volumes
- **Named volumes persist data** - Survives container restarts
- **Projects created inside container** - Use web UI to create projects

### When to Use

- Testing protoLabs safely
- Demo environments
- CI/CD testing

## Docker (Projects Mounted)

Mount your projects directory for development use:

### 1. Create Override File

Create `docker-compose.override.yml`:

```yaml
services:
  server:
    volumes:
      # Mount your projects directory
      # IMPORTANT: Container path MUST match host path
      - /home/youruser/dev:/home/youruser/dev:rw
    environment:
      - ALLOWED_ROOT_DIRECTORY=/home/youruser/dev
      - GH_TOKEN=${GH_TOKEN}
```

### 2. Build with Your UID/GID

```bash
UID=$(id -u) GID=$(id -g) docker compose build
```

### 3. Start

```bash
docker compose up -d
```

### Path Mapping Rules

**Critical**: Container paths MUST match host paths for the MCP plugin to work:

```yaml
# CORRECT - paths match
- /home/youruser/dev:/home/youruser/dev:rw

# WRONG - paths don't match (MCP plugin will fail)
- /projects:/home/youruser/dev
```

## systemd + Docker

For persistent server deployments, use systemd to manage Docker Compose.

### 1. Install Service File

```bash
# Copy the service file
sudo cp automaker.service /etc/systemd/system/

# Edit for your environment
sudo nano /etc/systemd/system/automaker.service
```

### 2. Configure Service

Edit the service file:

```ini
[Unit]
Description=protoLabs AI Development Studio
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/youruser/automaker
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose restart
TimeoutStartSec=120
TimeoutStopSec=60
Restart=on-failure
RestartSec=10

# Run as your user
User=youruser
Group=youruser

Environment=COMPOSE_PROJECT_NAME=automaker

[Install]
WantedBy=multi-user.target
```

### 3. Enable and Start

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable automaker

# Start now
sudo systemctl start automaker

# Check status
sudo systemctl status automaker
```

### 4. Management Commands

```bash
# View logs
sudo journalctl -u automaker -f

# Restart
sudo systemctl restart automaker

# Stop
sudo systemctl stop automaker

# Disable on boot
sudo systemctl disable automaker
```

## Environment Variables Reference

### Authentication

| Variable                   | Required | Description                                         |
| -------------------------- | -------- | --------------------------------------------------- |
| `ANTHROPIC_API_KEY`        | Yes\*    | Anthropic API key                                   |
| `CLAUDE_OAUTH_CREDENTIALS` | Yes\*    | Claude CLI OAuth JSON                               |
| `AUTOMAKER_API_KEY`        | No       | protoLabs API key (default: `protoLabs_studio_key`) |
| `CURSOR_AUTH_TOKEN`        | No       | Cursor CLI OAuth token                              |
| `GH_TOKEN`                 | No       | GitHub CLI token                                    |

\*At least one of `ANTHROPIC_API_KEY` or `CLAUDE_OAUTH_CREDENTIALS` is required.

### Server Configuration

| Variable                 | Default                 | Description                   |
| ------------------------ | ----------------------- | ----------------------------- |
| `PORT`                   | `3008`                  | Server port                   |
| `HOST`                   | `0.0.0.0`               | Host to bind to               |
| `HOSTNAME`               | `localhost`             | Hostname for user-facing URLs |
| `DATA_DIR`               | `./data` or `/data`     | Data storage directory        |
| `ALLOWED_ROOT_DIRECTORY` | `/projects`             | Restrict file operations      |
| `CORS_ORIGIN`            | `http://localhost:3007` | Allowed CORS origin           |

### Feature Flags

| Variable               | Default | Description                       |
| ---------------------- | ------- | --------------------------------- |
| `IS_CONTAINERIZED`     | `false` | Skip sandbox confirmation dialogs |
| `AUTOMAKER_MOCK_AGENT` | `false` | Use mock agent (for testing)      |
| `AUTOMAKER_AUTO_LOGIN` | `false` | Skip login prompt (dev only)      |

### Integrations

| Variable                           | Required | Description                                                                                      |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `DISCORD_TOKEN`                    | No       | Discord bot token for event routing and notifications                                            |
| `DISCORD_GUILD_ID`                 | No       | Discord server (guild) ID                                                                        |
| `DISCORD_CHANNEL_SUGGESTIONS`      | No       | Channel ID for `#suggestions` — community feature ideas                                          |
| `DISCORD_CHANNEL_PROJECT_PLANNING` | No       | Channel ID for `#project-planning` — epic and milestone discussions                              |
| `DISCORD_CHANNEL_AGENT_LOGS`       | No       | Channel ID for `#agent-logs` — agent start/stop/complete events                                  |
| `DISCORD_CHANNEL_CODE_REVIEW`      | No       | Channel ID for `#code-review` — PR reviews and architecture discussions                          |
| `DISCORD_CHANNEL_INFRA`            | No       | Channel ID for `#infra` — infrastructure alerts, health checks, Ava Gateway heartbeat monitoring |

### Monitoring (Grafana)

| Variable                | Default   | Description                                       |
| ----------------------- | --------- | ------------------------------------------------- |
| `GF_ADMIN_USER`         | `admin`   | Grafana admin username (override in staging/prod) |
| `GF_ADMIN_PASSWORD`     | `admin`   | Grafana admin password (override in staging/prod) |
| `DISCORD_WEBHOOK_INFRA` | _(empty)_ | Discord webhook URL for infrastructure alerts     |

Set these in your `.env` file to override the defaults for staging/production deployments:

```bash
GF_ADMIN_USER=your-admin-username
GF_ADMIN_PASSWORD=a-strong-password
```

> **Note:** Production deployments use Docker secrets for credential management. See `docker-compose.prod.yml` for the production pattern.

### Frontend Configuration

| Variable             | Default     | Description                       |
| -------------------- | ----------- | --------------------------------- |
| `VITE_SERVER_URL`    | `''`        | API server URL (empty = relative) |
| `VITE_HOSTNAME`      | `localhost` | Hostname for API URLs             |
| `VITE_SKIP_ELECTRON` | `false`     | Build without Electron            |

## Extracting OAuth Credentials

### Claude CLI (macOS)

```bash
# Extract from Keychain
./scripts/get-claude-token.sh

# Use in Docker
export CLAUDE_OAUTH_CREDENTIALS=$(./scripts/get-claude-token.sh)
docker compose up -d
```

### Claude CLI (Linux)

```bash
# On Linux, mount the directory directly
services:
  server:
    volumes:
      - ~/.claude:/home/automaker/.claude:ro
```

### Cursor CLI (macOS)

```bash
# Extract from Keychain
./scripts/get-cursor-token.sh

# Use in Docker
export CURSOR_AUTH_TOKEN=$(./scripts/get-cursor-token.sh)
```

### Cursor CLI (Linux)

```bash
# Extract from config file
export CURSOR_AUTH_TOKEN=$(jq -r '.accessToken' ~/.config/cursor/auth.json)
```

### GitHub CLI

```bash
# Extract existing token
export GH_TOKEN=$(gh auth token)
```

## SSL/TLS Configuration

For production deployments with HTTPS, use a reverse proxy:

### nginx Example

```nginx
server {
    listen 443 ssl;
    server_name protolabs.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3007;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location /api {
        proxy_pass http://localhost:3008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

### Update CORS

When using a custom domain:

```yaml
services:
  server:
    environment:
      - CORS_ORIGIN=https://protolabs.example.com
```

## Updating

### Docker

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose build --no-cache
docker compose up -d
```

### systemd

```bash
# Pull latest code
cd /path/to/protomaker
git pull

# Rebuild and restart
sudo systemctl restart automaker
```

## Backup Before Updating

```bash
# Backup Docker volumes
docker run --rm \
  -v automaker-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/automaker-backup-$(date +%Y%m%d).tar.gz /data
```

See [backup-recovery.md](./backup-recovery.md) for detailed backup procedures.

## Proxmox VM Specifications

### Recommended Specs by Use Case

| Use Case      | Disk      | RAM   | vCPU | Notes                                   |
| ------------- | --------- | ----- | ---- | --------------------------------------- |
| **Minimum**   | 25 GB     | 4 GB  | 2    | Evaluation only, expect slowness        |
| **Baseline**  | 40 GB     | 8 GB  | 4    | Most users, comfortable operation       |
| **Heavy Use** | 80-120 GB | 16 GB | 6-8  | Multiple concurrent agents, large repos |

### Proxmox-Specific Settings

**Storage:** Use thin provisioning, `virtio-scsi` with discard enabled, enable TRIM in guest OS.

**Memory:** Do NOT overcommit RAM. Disable ballooning (Node.js + Docker perform poorly with it).

**CPU:** Set CPU type to `host`. Enable NUMA only if >= 16 GB RAM.

**Recommended Distro:** Ubuntu 22.04 LTS or Debian 12.
