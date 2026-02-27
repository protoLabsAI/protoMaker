# Backup & Recovery

This guide covers backup and recovery procedures for protoLabs data.

## What to Back Up

### Docker Volumes

| Volume                    | Contains                       | Priority |
| ------------------------- | ------------------------------ | -------- |
| `automaker-data`          | Sessions, settings, agent data | Critical |
| `automaker-claude-config` | Claude CLI OAuth tokens        | High     |
| `automaker-cursor-config` | Cursor CLI configuration       | High     |
| `automaker-opencode-*`    | OpenCode configuration         | Medium   |

### Project Data

Projects are stored in:

- **Isolated mode**: Docker volume (no host backup needed)
- **Mounted mode**: Host filesystem (back up with your normal system backups)

### Project-Specific Data

Each project has a `.automaker/` directory containing:

- `features/` - Feature definitions and agent output
- `context/` - Context files for AI agents
- `settings.json` - Project settings
- `spec.md` - Project specification

## Backup Procedures

### Automated Backup (Recommended)

Use the backup script for automated backups with metadata and retention:

```bash
# Backup all volumes (default: 30-day retention)
./scripts/backup-volumes.sh

# Restore from a backup
./scripts/restore-volumes.sh ./backups/automaker-backup-20260205_020000
```

The backup script:

- Backs up all Docker volumes with metadata (hostname, timestamp)
- Cleans up backups older than the retention period
- Creates individual `.tar.gz` per volume for selective restore

### Quick Backup (Manual)

```bash
# Create backup directory
mkdir -p ~/automaker-backups

# Backup all data volumes
docker run --rm \
  -v automaker-data:/data \
  -v automaker-claude-config:/claude \
  -v automaker-cursor-config:/cursor \
  -v ~/automaker-backups:/backup \
  alpine tar czf /backup/automaker-full-$(date +%Y%m%d-%H%M%S).tar.gz \
    /data /claude /cursor
```

### Backup Individual Volumes

```bash
# Data volume only
docker run --rm \
  -v automaker-data:/data:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/automaker-data-$(date +%Y%m%d).tar.gz /data

# Claude config
docker run --rm \
  -v automaker-claude-config:/claude:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/claude-config-$(date +%Y%m%d).tar.gz /claude
```

### Backup with Running Containers

For consistency, stop containers before backing up:

```bash
# Stop services
docker compose stop

# Perform backup
docker run --rm \
  -v automaker-data:/data:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/automaker-data-$(date +%Y%m%d).tar.gz /data

# Restart services
docker compose start
```

### Automated Backups (Cron)

Create a backup script:

```bash
#!/bin/bash
# /home/user/scripts/backup-automaker.sh

BACKUP_DIR="/home/user/automaker-backups"
DATE=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=30

# Create backup
docker run --rm \
  -v automaker-data:/data:ro \
  -v automaker-claude-config:/claude:ro \
  -v automaker-cursor-config:/cursor:ro \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/automaker-$DATE.tar.gz" /data /claude /cursor

# Clean old backups
find "$BACKUP_DIR" -name "automaker-*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: automaker-$DATE.tar.gz"
```

Add to crontab:

```bash
# Daily at 2 AM
0 2 * * * /home/user/scripts/backup-automaker.sh >> /var/log/automaker-backup.log 2>&1
```

### Using /devops Skill

```
/devops backup
```

This interactive command:

1. Shows current volume sizes
2. Confirms backup location
3. Performs the backup
4. Verifies integrity
5. Optionally cleans old backups

## Recovery Procedures

### Restore All Data

```bash
# Stop services
docker compose down

# Remove existing volumes (CAUTION!)
docker volume rm automaker-data automaker-claude-config automaker-cursor-config

# Recreate volumes
docker volume create automaker-data
docker volume create automaker-claude-config
docker volume create automaker-cursor-config

# Restore from backup
docker run --rm \
  -v automaker-data:/data \
  -v automaker-claude-config:/claude \
  -v automaker-cursor-config:/cursor \
  -v ~/automaker-backups:/backup:ro \
  alpine sh -c "cd / && tar xzf /backup/automaker-full-20260205.tar.gz"

# Restart services
docker compose up -d
```

### Restore Individual Volume

```bash
# Stop services
docker compose stop

# Restore data volume
docker run --rm \
  -v automaker-data:/data \
  -v $(pwd):/backup:ro \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/automaker-data-20260205.tar.gz -C /"

# Restart services
docker compose start
```

### Restore to New Installation

```bash
# Clone repository
git clone https://github.com/proto-labs-ai/protomaker.git
cd protomaker

# Create volumes
docker volume create automaker-data
docker volume create automaker-claude-config
docker volume create automaker-cursor-config

# Restore backup
docker run --rm \
  -v automaker-data:/data \
  -v automaker-claude-config:/claude \
  -v automaker-cursor-config:/cursor \
  -v /path/to/backup:/backup:ro \
  alpine sh -c "cd / && tar xzf /backup/automaker-full-20260205.tar.gz"

# Start services
docker compose up -d
```

## Backup Verification

### List Backup Contents

```bash
tar tzf automaker-full-20260205.tar.gz | head -20
```

### Test Restore to Temporary Volume

```bash
# Create test volume
docker volume create automaker-test-restore

# Restore to test volume
docker run --rm \
  -v automaker-test-restore:/data \
  -v $(pwd):/backup:ro \
  alpine sh -c "tar xzf /backup/automaker-data-20260205.tar.gz -C /"

# Verify contents
docker run --rm \
  -v automaker-test-restore:/data:ro \
  alpine ls -la /data

# Clean up
docker volume rm automaker-test-restore
```

### Verify Data Integrity

```bash
# Check backup file integrity
gzip -t automaker-full-20260205.tar.gz && echo "OK" || echo "CORRUPTED"

# Check tar archive
tar tzf automaker-full-20260205.tar.gz > /dev/null && echo "OK" || echo "CORRUPTED"
```

## Disaster Recovery

### Scenario: Corrupted Data Volume

1. Stop services: `docker compose down`
2. Identify latest valid backup
3. Remove corrupted volume: `docker volume rm automaker-data`
4. Restore from backup (see above)
5. Restart: `docker compose up -d`

### Scenario: Lost Authentication

1. Re-authenticate Claude CLI:

   ```bash
   docker exec -it automaker-server claude login
   ```

2. Or restore from backup:
   ```bash
   docker run --rm \
     -v automaker-claude-config:/claude \
     -v $(pwd):/backup:ro \
     alpine sh -c "tar xzf /backup/claude-config-20260205.tar.gz -C /"
   ```

### Scenario: Complete System Loss

1. Set up new server
2. Install Docker and Docker Compose
3. Clone protoLabs repository
4. Transfer backup file from offsite storage
5. Restore volumes (see "Restore to New Installation")
6. Update environment variables (`.env`)
7. Start services

## Offsite Backup

### Upload to S3

```bash
# Install AWS CLI
apt install awscli

# Configure credentials
aws configure

# Upload backup
aws s3 cp automaker-full-20260205.tar.gz s3://your-bucket/automaker-backups/
```

### Sync to Remote Server

```bash
rsync -avz ~/automaker-backups/ user@backup-server:/backups/automaker/
```

### Encrypted Backup

```bash
# Create encrypted backup
docker run --rm \
  -v automaker-data:/data:ro \
  -v $(pwd):/backup \
  alpine sh -c "tar cz /data | openssl enc -aes-256-cbc -pbkdf2 -out /backup/automaker-encrypted.tar.gz.enc"

# Decrypt and restore
openssl enc -d -aes-256-cbc -pbkdf2 -in automaker-encrypted.tar.gz.enc | \
  docker run --rm -i \
    -v automaker-data:/data \
    alpine tar xz -C /
```

## Backup Schedule Recommendations

| Data                 | Frequency | Retention |
| -------------------- | --------- | --------- |
| Full backup          | Daily     | 30 days   |
| Claude/Cursor config | Weekly    | 90 days   |
| Offsite sync         | Weekly    | 1 year    |

## Volume Sizes

Check current volume sizes:

```bash
# Get volume mount points
docker volume inspect automaker-data --format '{{ .Mountpoint }}'

# Check sizes (requires root)
sudo du -sh /var/lib/docker/volumes/automaker-*/

# Or via container
docker run --rm \
  -v automaker-data:/data:ro \
  alpine du -sh /data
```

Typical sizes:

- `automaker-data`: 50MB - 500MB (depends on usage)
- `automaker-claude-config`: < 1MB
- `automaker-cursor-config`: < 1MB
