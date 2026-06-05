# systemd Service Configuration

This guide covers running protoLabs as a systemd service for persistent deployments.

Two systemd units ship in the repository root. **Pick exactly one per host** — do not enable both:

| Unit                       | Runs                                               | When to use                                                                                            |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `automaker-docker.service` | `docker compose up -d`                             | Containerized prod, full filesystem isolation, no host CLI access from agents                          |
| `automaker-host.service`   | `npm start` (= `start-automaker.mjs --production`) | Bare-metal prod. Agents can shell out to host CLIs (`gh`, `codex`, `opencode`, `infisical`, `claude`). |

The host-process variant exists because agents spawn external tools via `child_process`; in containers those tools either aren't installed or can't see the host's auth files. If your operator workflow depends on `gh auth login` or `codex login` happening on the host, use `automaker-host.service`.

This page is the systemd reference. The [Deployment guide](./deployment.md#systemd) covers the same units in the context of the full deployment options.

## The Docker variant

`automaker-docker.service` (repository root):

```ini
[Unit]
Description=protoLabs AI Development Studio (Docker)
Documentation=https://github.com/protoLabsAI/protomaker
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/protomaker
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose restart
TimeoutStartSec=120
TimeoutStopSec=60
Restart=on-failure
RestartSec=10

User=automaker
Group=automaker

Environment=COMPOSE_PROJECT_NAME=automaker

[Install]
WantedBy=multi-user.target
```

The shipped file uses the default `docker-compose.yml`. For a prod deploy, set `WorkingDirectory` to the directory containing `docker-compose.prod.yml` and add `Environment=COMPOSE_FILE=docker-compose.prod.yml` to the `[Service]` block.

### Install

```bash
# Copy the service file
sudo cp automaker-docker.service /etc/systemd/system/

# Edit for your environment
sudo nano /etc/systemd/system/automaker-docker.service
#   WorkingDirectory = path containing the compose file
#   User / Group     = deploy user (must have Docker access)

sudo systemctl daemon-reload
sudo systemctl enable --now automaker-docker.service
```

## The host-process variant

`automaker-host.service` (repository root) runs the server directly on the host with `npm start`. Use it when agents must reach host CLIs.

### Install

```bash
# Copy the service file
sudo cp automaker-host.service /etc/systemd/system/

# Edit for your environment if defaults don't match
sudo nano /etc/systemd/system/automaker-host.service
#   WorkingDirectory  = clone path (default: /opt/protomaker)
#   User / Group      = deploy user (default: automaker)
#   Environment=HOME  = $HOME for that user (default: /home/automaker)

sudo systemctl daemon-reload
sudo systemctl enable --now automaker-host.service
journalctl -u automaker-host -f
```

## Enable and start

```bash
sudo systemctl daemon-reload

# Pick exactly one:
sudo systemctl enable --now automaker-host.service
# OR
sudo systemctl enable --now automaker-docker.service
```

## Service Options Explained (Docker variant)

### Unit Section

```ini
[Unit]
After=docker.service
Requires=docker.service
```

- `After=docker.service` - Start after Docker is running
- `Requires=docker.service` - Fail if Docker isn't available

### Service Section

```ini
[Service]
Type=oneshot
RemainAfterExit=yes
```

- `Type=oneshot` - Service runs a command and exits
- `RemainAfterExit=yes` - Consider service "active" after command completes

```ini
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose restart
```

- `ExecStart` / `ExecStop` / `ExecReload` - Start, stop, and restart the containers

```ini
Restart=on-failure
RestartSec=10
```

- Automatically restart on failure, waiting 10 seconds between attempts

```ini
User=automaker
Group=automaker
```

- Run as a non-root user (must have Docker access for the Docker variant)

## Management Commands

Substitute the unit you enabled (`automaker-docker` or `automaker-host`).

### Status

```bash
sudo systemctl status automaker-docker
# or
sudo systemctl status automaker-host
```

### Start / Stop / Restart

```bash
sudo systemctl start automaker-docker
sudo systemctl stop automaker-docker
sudo systemctl restart automaker-docker

# Reload (Docker variant only — restarts containers)
sudo systemctl reload automaker-docker
```

### Enable / Disable

```bash
sudo systemctl enable automaker-docker
sudo systemctl disable automaker-docker
```

### View Logs

```bash
# Recent logs
sudo journalctl -u automaker-docker

# Follow logs
sudo journalctl -u automaker-host -f

# Since boot
sudo journalctl -u automaker-docker -b

# Last hour
sudo journalctl -u automaker-host --since="1 hour ago"
```

## Environment Variables

### Via Environment File

Create `/etc/automaker.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-xxx
GH_TOKEN=ghp_xxx
AUTOMAKER_API_KEY=your-key
```

Add to the service file:

```ini
[Service]
EnvironmentFile=/etc/automaker.env
```

Secure the file:

```bash
sudo chmod 600 /etc/automaker.env
sudo chown root:root /etc/automaker.env
```

### Via docker-compose.override.yml (Docker variant)

Preferred for the Docker variant — keep secrets in your compose override:

```yaml
# docker-compose.override.yml
services:
  server:
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GH_TOKEN=${GH_TOKEN}
```

Then source from a `.env` file in the working directory.

## User Permissions (Docker variant)

The Docker variant runs as a non-root user who must have Docker access:

```bash
# Add user to docker group
sudo usermod -aG docker automaker

# Log out and back in, or:
newgrp docker
```

## Troubleshooting

### Service Won't Start

```bash
# Check status
sudo systemctl status automaker-docker

# Check detailed logs
sudo journalctl -u automaker-docker -n 50

# For the Docker variant, check the containers directly
docker compose ps
docker compose logs
```

### Permission Denied (Docker variant)

```bash
# Verify Docker group membership
groups automaker

# Verify Docker socket permissions
ls -la /var/run/docker.sock
```

### Containers Not Starting (Docker variant)

```bash
# Check if Docker is running
sudo systemctl status docker

# Start Docker if needed
sudo systemctl start docker

# Then restart protoLabs
sudo systemctl restart automaker-docker
```

### Service Times Out

Increase the timeout values in the `[Service]` block:

```ini
[Service]
TimeoutStartSec=300
TimeoutStopSec=120
```

## Comparison: systemd vs plain Docker

| Feature             | systemd                | Docker Only                |
| ------------------- | ---------------------- | -------------------------- |
| Auto-start on boot  | Yes                    | Requires `restart: always` |
| Centralized logging | journalctl             | docker logs                |
| Resource limits     | cgroups                | Docker limits              |
| Dependencies        | `After=` / `Requires=` | `depends_on`               |
| Management          | systemctl              | docker compose             |

Both approaches work well. Use systemd if you want integration with system init, centralized logging via journalctl, and consistent management with other services.
