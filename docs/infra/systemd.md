# systemd Service Configuration

This guide covers running Automaker as a systemd service for persistent deployments.

## Service File

The service file is located at `automaker.service` in the repository root.

```ini
[Unit]
Description=Automaker AI Development Studio
Documentation=https://github.com/proto-labs-ai/automaker
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/josh/dev/automaker
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose restart
TimeoutStartSec=120
TimeoutStopSec=60
Restart=on-failure
RestartSec=10

User=josh
Group=josh

Environment=COMPOSE_PROJECT_NAME=automaker

[Install]
WantedBy=multi-user.target
```

## Installation

### 1. Copy Service File

```bash
sudo cp automaker.service /etc/systemd/system/automaker.service
```

### 2. Edit for Your Environment

```bash
sudo nano /etc/systemd/system/automaker.service
```

Update:

- `WorkingDirectory` - Path to your Automaker installation
- `User` / `Group` - Your username

### 3. Reload systemd

```bash
sudo systemctl daemon-reload
```

### 4. Enable and Start

```bash
# Enable on boot
sudo systemctl enable automaker

# Start now
sudo systemctl start automaker
```

## Service Options Explained

### Unit Section

```ini
[Unit]
Description=Automaker AI Development Studio
Documentation=https://github.com/proto-labs-ai/automaker
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

- `ExecStart` - Command to start service
- `ExecStop` - Command to stop service
- `ExecReload` - Command to reload (restart containers)

```ini
TimeoutStartSec=120
TimeoutStopSec=60
```

- Timeouts for start/stop operations (pulling images may take time)

```ini
Restart=on-failure
RestartSec=10
```

- Automatically restart on failure
- Wait 10 seconds between restart attempts

```ini
User=josh
Group=josh
```

- Run as a non-root user (must have Docker access)

### Install Section

```ini
[Install]
WantedBy=multi-user.target
```

- Start when system reaches multi-user mode (normal boot)

## Management Commands

### Status

```bash
sudo systemctl status automaker
```

Output:

```
● automaker.service - Automaker AI Development Studio
     Loaded: loaded (/etc/systemd/system/automaker.service; enabled)
     Active: active (exited) since Wed 2026-02-05 10:00:00 UTC
       Docs: https://github.com/proto-labs-ai/automaker
    Process: 1234 ExecStart=/usr/bin/docker compose up -d (code=exited, status=0/SUCCESS)
   Main PID: 1234 (code=exited, status=0/SUCCESS)
```

### Start / Stop / Restart

```bash
# Start
sudo systemctl start automaker

# Stop
sudo systemctl stop automaker

# Restart
sudo systemctl restart automaker

# Reload (restart containers)
sudo systemctl reload automaker
```

### Enable / Disable

```bash
# Enable on boot
sudo systemctl enable automaker

# Disable on boot
sudo systemctl disable automaker
```

### View Logs

```bash
# Recent logs
sudo journalctl -u automaker

# Follow logs
sudo journalctl -u automaker -f

# Since boot
sudo journalctl -u automaker -b

# Last hour
sudo journalctl -u automaker --since="1 hour ago"
```

## Environment Variables

### Via Environment File

Create `/etc/automaker.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-xxx
GH_TOKEN=ghp_xxx
AUTOMAKER_API_KEY=your-key
```

Update service file:

```ini
[Service]
EnvironmentFile=/etc/automaker.env
```

Secure the file:

```bash
sudo chmod 600 /etc/automaker.env
sudo chown root:root /etc/automaker.env
```

### Via Service File

```ini
[Service]
Environment=ANTHROPIC_API_KEY=sk-ant-xxx
Environment=AUTOMAKER_API_KEY=your-key
```

**Warning**: Avoid this method for secrets as service files may be readable by users.

### Via docker-compose.override.yml

Preferred method - keep secrets in your docker-compose override:

```yaml
# docker-compose.override.yml
services:
  server:
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GH_TOKEN=${GH_TOKEN}
```

Then source from `.env` file in the working directory.

## User Permissions

The service runs as a non-root user who must have Docker access:

```bash
# Add user to docker group
sudo usermod -aG docker yourusername

# Log out and back in, or:
newgrp docker
```

## Troubleshooting

### Service Won't Start

```bash
# Check status
sudo systemctl status automaker

# Check detailed logs
sudo journalctl -u automaker -n 50

# Check Docker
docker compose ps
docker compose logs
```

### Permission Denied

```bash
# Verify Docker group membership
groups yourusername

# Verify Docker socket permissions
ls -la /var/run/docker.sock
```

### Containers Not Starting

```bash
# Check if Docker is running
sudo systemctl status docker

# Start Docker if needed
sudo systemctl start docker

# Then restart Automaker
sudo systemctl restart automaker
```

### Service Times Out

Increase timeout values:

```ini
[Service]
TimeoutStartSec=300
TimeoutStopSec=120
```

## Advanced Configuration

### Health Monitoring

Add a health check that stops the service if containers are unhealthy:

```bash
#!/bin/bash
# /usr/local/bin/automaker-healthcheck.sh

if ! docker compose ps | grep -q "healthy"; then
    echo "Containers unhealthy, triggering restart"
    systemctl restart automaker
fi
```

Create a timer:

```ini
# /etc/systemd/system/automaker-healthcheck.timer
[Unit]
Description=Automaker Health Check

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/automaker-healthcheck.service
[Unit]
Description=Automaker Health Check

[Service]
Type=oneshot
ExecStart=/usr/local/bin/automaker-healthcheck.sh
```

Enable the timer:

```bash
sudo systemctl enable automaker-healthcheck.timer
sudo systemctl start automaker-healthcheck.timer
```

### Multiple Instances

For running multiple Automaker instances:

```ini
# /etc/systemd/system/automaker@.service
[Unit]
Description=Automaker AI Development Studio - %i
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/%i/automaker
ExecStart=/usr/bin/docker compose -p automaker-%i up -d
ExecStop=/usr/bin/docker compose -p automaker-%i down
User=%i
Group=%i

[Install]
WantedBy=multi-user.target
```

Usage:

```bash
sudo systemctl start automaker@josh
sudo systemctl start automaker@alice
```

## Comparison: systemd vs Docker

| Feature             | systemd                | Docker Only                |
| ------------------- | ---------------------- | -------------------------- |
| Auto-start on boot  | Yes                    | Requires `restart: always` |
| Centralized logging | journalctl             | docker logs                |
| Resource limits     | cgroups                | Docker limits              |
| Dependencies        | `After=` / `Requires=` | `depends_on`               |
| Management          | systemctl              | docker compose             |

Both approaches work well. Use systemd if you want:

- Integration with system init
- Centralized logging via journalctl
- Consistent management with other services
