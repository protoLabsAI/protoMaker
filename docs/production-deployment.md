# Automaker Production Deployment Guide

Complete guide for deploying Automaker in a production environment with Docker.

## Prerequisites

- Docker 20.10+ with Swarm mode enabled
- Docker Compose 2.0+
- 8GB+ RAM available
- 50GB+ disk space
- Linux server (Ubuntu 22.04+ recommended)

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/proto-labs-ai/automaker.git
cd automaker

# 2. Create Docker secrets
echo "your-anthropic-api-key" | docker secret create anthropic_api_key -
echo "your-automaker-api-key" | docker secret create automaker_api_key -
echo "your-github-token" | docker secret create gh_token -
openssl rand -base64 16 | docker secret create grafana_admin_password -
# Create optional secrets (empty if not used)
echo "" | docker secret create claude_oauth_credentials -
echo "" | docker secret create cursor_auth_token -

# 3. Deploy stack
docker stack deploy -c docker-compose.prod.yml automaker

# 4. Verify deployment
docker service ls
curl http://localhost:3008/api/health
```

## Detailed Setup

### 1. Server Preparation

**System Requirements:**

- 4+ CPU cores
- 16GB+ RAM (32GB recommended for heavy workloads)
- 100GB+ SSD storage
- Ubuntu 22.04 LTS or similar

**Install Docker:**

```bash
# Official Docker installation (recommended: review script before running)
# Option 1: Download and inspect first (safer)
curl -fsSL https://get.docker.com -o get-docker.sh
less get-docker.sh  # Review the script
sudo sh get-docker.sh

# Option 2: Use official apt repository (most secure)
# See: https://docs.docker.com/engine/install/ubuntu/

sudo usermod -aG docker $USER

# Enable Swarm mode (required for Docker secrets)
docker swarm init
```

**System Tuning:**

```bash
# Increase file limits
echo "fs.file-max = 65536" | sudo tee -a /etc/sysctl.conf
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
sudo sysctl -p

# Optional: Reduce swap usage (WARNING: disabling swap entirely can cause OOM kills)
# Option 1: Reduce swappiness (recommended)
echo "vm.swappiness = 10" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Option 2: Disable swap (use with caution - test workloads first, monitor memory)
# sudo swapoff -a
# Docker's --memory and --memory-swap flags provide better container-level control
```

### 2. Secret Management

**Create required secrets:**

```bash
# Anthropic API key (required)
echo "sk-ant-api..." | docker secret create anthropic_api_key -

# Automaker API key (recommended - auto-generated if omitted)
openssl rand -base64 32 | docker secret create automaker_api_key -

# GitHub token (required for git operations)
gh auth token | docker secret create gh_token -

# Grafana admin password (CHANGE THIS - don't use 'admin' in production!)
openssl rand -base64 16 | docker secret create grafana_admin_password -

# Optional: Claude OAuth credentials (create empty if not used)
./scripts/get-claude-token.sh | docker secret create claude_oauth_credentials - || \
  echo "" | docker secret create claude_oauth_credentials -

# Optional: Cursor auth token (create empty if not used)
./scripts/get-cursor-token.sh | docker secret create cursor_auth_token - || \
  echo "" | docker secret create cursor_auth_token -
```

**Verify secrets:**

```bash
docker secret ls
```

### 3. Configuration

**Environment Variables:**

Create `.env` file (not committed to git):

```bash
# Build arguments
UID=1001
GID=1001

# Optional overrides
CORS_ORIGIN=https://automaker.your-domain.com
ALLOWED_ROOT_DIRECTORY=/projects
```

**Volume Configuration:**

Edit `docker-compose.prod.yml` volume settings for your backup strategy:

```yaml
volumes:
  automaker-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/lib/automaker/data # Adjust path
```

### 4. Deployment

**Option A: Docker Stack (Recommended for Production)**

```bash
# Deploy with Docker Swarm
docker stack deploy -c docker-compose.prod.yml automaker

# Check status
docker stack services automaker
docker stack ps automaker

# View logs
docker service logs -f automaker_server
```

**Option B: Docker Compose**

```bash
# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f server
```

### 5. Verification

**Health Checks:**

```bash
# Server health
curl http://localhost:3008/api/health
# Expected: {"status":"ok","timestamp":"...","version":"..."}

# UI
curl http://localhost:3007/
# Expected: HTML page

# Prometheus metrics
curl http://localhost:3008/metrics
# Expected: Prometheus-formatted metrics

# Grafana
open http://localhost:3000
# Login: admin/admin
```

**Service Status:**

```bash
# Docker stack
docker service ls

# Expected services:
# - automaker_ui (1 replica)
# - automaker_server (2 replicas)
# - automaker_prometheus (1 replica)
# - automaker_grafana (1 replica)
```

## Monitoring

### Prometheus

Access: http://localhost:9091

**Key Metrics:**

- `automaker_agents_active` - Currently running agents
- `automaker_features_total` - Total features by status
- `automaker_api_requests_duration_seconds` - API latency
- `process_resident_memory_bytes` - Memory usage

### Grafana

Access: http://localhost:3000

> **⚠️ SECURITY WARNING:** The default Grafana password is set via Docker secret.
> You MUST change it immediately after first login:
>
> 1. Log in with the password from your `grafana_admin_password` secret
> 2. Go to Administration → Users → admin → Change password
> 3. Use a strong, unique password
> 4. Consider restricting network access to Grafana (firewall rules, VPN)

**Import Dashboards:**

1. Go to Dashboards → Import
2. Use dashboard ID or upload JSON
3. Select Prometheus data source

**Recommended Dashboards:**

- Node Exporter Full (ID: 1860)
- Docker Container Metrics (ID: 893)
- Custom Automaker dashboard (see `grafana-dashboards/`)

## Backup & Recovery

### Automated Backups

**Setup Cron Job:**

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/automaker/scripts/backup-volumes.sh /backup/automaker
```

**Manual Backup:**

```bash
./scripts/backup-volumes.sh /backup/automaker
```

**Backup Output:**

```
/backup/automaker/
└── automaker-backup-20260205_020000/
    ├── automaker-data.tar.gz
    ├── automaker-claude-config.tar.gz
    ├── automaker-cursor-config.tar.gz
    ├── ...
    └── metadata.json
```

### Restore from Backup

**Stop Services:**

```bash
docker stack rm automaker
# Or: docker-compose -f docker-compose.prod.yml down
```

**Restore Volumes:**

```bash
./scripts/restore-volumes.sh /backup/automaker/automaker-backup-20260205_020000
```

**Restart Services:**

```bash
docker stack deploy -c docker-compose.prod.yml automaker
```

## Scaling

### Horizontal Scaling

**Increase Server Replicas:**

```yaml
# docker-compose.prod.yml
services:
  server:
    deploy:
      replicas: 4 # Increase from 2
```

**Apply Changes:**

```bash
docker stack deploy -c docker-compose.prod.yml automaker
```

### Resource Limits

**Adjust CPU/Memory:**

```yaml
services:
  server:
    deploy:
      resources:
        limits:
          cpus: '4' # Increase from 2
          memory: 16G # Increase from 8G
```

## Security Hardening

### Network Isolation

**Create Custom Network:**

```yaml
networks:
  automaker-internal:
    driver: overlay
    internal: true
  automaker-external:
    driver: overlay

services:
  server:
    networks:
      - automaker-internal
      - automaker-external
```

### TLS/SSL Configuration

**Use Reverse Proxy (Nginx/Traefik):**

```bash
# Install Certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d automaker.your-domain.com

# Mount certificates in docker-compose
```

### Firewall Rules

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

## Troubleshooting

### Common Issues

**1. Services Won't Start**

```bash
# Check logs
docker service logs automaker_server

# Common causes:
# - Missing secrets
# - Port conflicts
# - Insufficient resources
```

**2. Out of Memory**

```bash
# Check memory usage
docker stats

# Increase limits in docker-compose.prod.yml
# Or add swap (not recommended for production)
```

**3. Agents Failing**

```bash
# Check detailed health
curl http://localhost:3008/api/health/detailed

# Look for:
# - High memory usage (>80%)
# - Stuck features
# - Retryable errors
```

**4. Volume Permission Issues**

```bash
# Fix ownership
docker run --rm -v automaker-data:/data alpine chown -R 1001:1001 /data
```

### Debug Mode

**Enable Debug Logging:**

```bash
# Add to docker-compose.prod.yml
environment:
  - LOG_LEVEL=debug
  - AUTOMAKER_DEBUG_RAW_OUTPUT=true
```

## Maintenance

### Updates

**Update to Latest Version:**

```bash
# Pull latest code
git pull origin main

# Rebuild images
docker-compose -f docker-compose.prod.yml build

# Deploy (zero-downtime with stack)
docker stack deploy -c docker-compose.prod.yml automaker
```

### Cleanup

**Remove Old Images:**

```bash
docker image prune -a
```

**Remove Old Volumes:**

```bash
# List volumes
docker volume ls

# Remove unused
docker volume prune
```

**Remove Old Backups:**

```bash
# Automated (configured in backup script)
RETENTION_DAYS=30

# Manual
find /backup/automaker -type d -name "automaker-backup-*" -mtime +30 -exec rm -rf {} \;
```

## Performance Optimization

### Resource Tuning

**Monitor and Adjust:**

```bash
# Watch resource usage
docker stats

# Adjust based on:
# - CPU utilization (<80% ideal)
# - Memory usage (<80% ideal)
# - Network I/O
```

### Database Optimization

(Automaker uses file-based storage, not a database)

**File System:**

- Use SSD for volumes
- Regular backups to prevent corruption
- Monitor disk space usage

## Disaster Recovery

### Recovery Plan

**RPO (Recovery Point Objective):** 24 hours (daily backups)
**RTO (Recovery Time Objective):** <30 minutes

**Steps:**

1. Stop corrupted services
2. Restore from latest backup
3. Restart services
4. Verify data integrity
5. Resume operations

**Test Recovery Quarterly:**

```bash
# 1. Take snapshot
./scripts/backup-volumes.sh /test/backup

# 2. Destroy volumes
docker volume rm automaker-data

# 3. Restore (use exact path - don't use wildcards)
# List available backups:
ls -d /test/backup/automaker-backup-* | tail -1
# Then restore with the specific path:
./scripts/restore-volumes.sh /test/backup/automaker-backup-20260205_020000

# 4. Verify
docker stack deploy -c docker-compose.prod.yml automaker
curl http://localhost:3008/api/health
```

## Support

For issues or questions:

- GitHub Issues: https://github.com/proto-labs-ai/automaker/issues
- Documentation: https://github.com/proto-labs-ai/automaker/tree/main/docs

## Appendix

### File Locations

**Configuration:**

- `docker-compose.prod.yml` - Production compose file
- `prometheus.yml` - Prometheus configuration
- `.env` - Environment variables (not committed)

**Scripts:**

- `scripts/backup-volumes.sh` - Backup automation
- `scripts/restore-volumes.sh` - Restore automation
- `docker-entrypoint.sh` - Container startup script

**Data:**

- `/var/lib/docker/volumes/` - Docker volumes
- `/backup/automaker/` - Backup storage

### Resource Requirements

| Component                     | CPU           | Memory      | Disk     |
| ----------------------------- | ------------- | ----------- | -------- |
| Server (per replica)          | 1-2 cores     | 4-8GB       | 10GB     |
| UI                            | 0.25 cores    | 256MB       | 100MB    |
| Prometheus                    | 0.25 cores    | 512MB       | 10GB     |
| Grafana                       | 0.25 cores    | 256MB       | 1GB      |
| **Total (2 server replicas)** | **3-5 cores** | **10-18GB** | **31GB** |

### Changelog

- 2026-02-05: Initial production deployment guide
