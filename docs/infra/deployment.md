# Deployment Guide

This guide covers different deployment options for Automaker.

## Deployment Options

| Option                    | Best For          | Isolation    | Setup Complexity |
| ------------------------- | ----------------- | ------------ | ---------------- |
| Local Development         | Development       | None         | Low              |
| Docker (Isolated)         | Testing, demos    | Full         | Low              |
| Docker (Projects Mounted) | Personal use      | Partial      | Medium           |
| systemd + Docker          | Production server | Configurable | Medium           |

## Local Development

For development, run Automaker directly on your machine:

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

Run Automaker in complete isolation from your filesystem:

```bash
docker compose up -d
```

Access at `http://localhost:3007`

### Characteristics

- **No access to host files** - Only Docker volumes
- **Named volumes persist data** - Survives container restarts
- **Projects created inside container** - Use web UI to create projects

### When to Use

- Testing Automaker safely
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
- /home/josh/dev:/home/josh/dev:rw

# WRONG - paths don't match (MCP plugin will fail)
- /projects:/home/josh/dev
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
Description=Automaker AI Development Studio
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

| Variable                   | Required | Description                                 |
| -------------------------- | -------- | ------------------------------------------- |
| `ANTHROPIC_API_KEY`        | Yes\*    | Anthropic API key                           |
| `CLAUDE_OAUTH_CREDENTIALS` | Yes\*    | Claude CLI OAuth JSON                       |
| `AUTOMAKER_API_KEY`        | No       | Automaker API key (auto-generated if blank) |
| `CURSOR_AUTH_TOKEN`        | No       | Cursor CLI OAuth token                      |
| `GH_TOKEN`                 | No       | GitHub CLI token                            |

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

| Variable                 | Default | Description                       |
| ------------------------ | ------- | --------------------------------- |
| `IS_CONTAINERIZED`       | `false` | Skip sandbox confirmation dialogs |
| `AUTOMAKER_MOCK_AGENT`   | `false` | Use mock agent (for testing)      |
| `AUTOMAKER_AUTO_LOGIN`   | `false` | Skip login prompt (dev only)      |
| `AUTOMAKER_HIDE_API_KEY` | `false` | Don't log API key at startup      |

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
    server_name automaker.example.com;

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
      - CORS_ORIGIN=https://automaker.example.com
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
cd /path/to/automaker
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
