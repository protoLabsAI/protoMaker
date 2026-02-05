#!/bin/bash
# Automaker Volume Backup Script
# Backs up all Docker volumes to a specified backup directory
#
# Usage:
#   ./scripts/backup-volumes.sh [backup-dir]
#
# Default backup dir: ./backups
#
# Schedule with cron:
#   0 2 * * * /path/to/automaker/scripts/backup-volumes.sh /backup/automaker

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="automaker-backup-${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
RETENTION_DAYS=30

# Volumes to backup (use VOLUME_SUFFIX env var for prod volumes, e.g., "-prod")
SUFFIX="${VOLUME_SUFFIX:-}"
VOLUMES=(
  "automaker-data${SUFFIX}"
  "automaker-claude-config${SUFFIX}"
  "automaker-cursor-config${SUFFIX}"
  "automaker-opencode-data${SUFFIX}"
  "automaker-opencode-config${SUFFIX}"
  "automaker-opencode-cache${SUFFIX}"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
  echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
  echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  error "Docker is not running"
  exit 1
fi

# Create backup directory
mkdir -p "${BACKUP_DIR}"
mkdir -p "${BACKUP_PATH}"

log "Starting backup to ${BACKUP_PATH}"

# Backup each volume
for volume in "${VOLUMES[@]}"; do
  log "Backing up volume: ${volume}"

  # Check if volume exists
  if ! docker volume inspect "${volume}" > /dev/null 2>&1; then
    warn "Volume ${volume} does not exist, skipping"
    continue
  fi

  # Backup using alpine container
  if docker run --rm \
    -v "${volume}:/source:ro" \
    -v "${BACKUP_PATH}:/backup" \
    alpine \
    tar czf "/backup/${volume}.tar.gz" -C /source .; then
    log "✓ Backed up ${volume}"
  else
    error "✗ Failed to backup ${volume}"
  fi
done

# Create backup metadata
cat > "${BACKUP_PATH}/metadata.json" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "volumes": [
$(printf '    "%s",\n' "${VOLUMES[@]}" | sed '$ s/,$//')
  ]
}
EOF

# Calculate backup size
BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" | cut -f1)
log "Backup complete: ${BACKUP_SIZE}"

# Cleanup old backups
log "Cleaning up backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -maxdepth 1 -type d -name "automaker-backup-*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \;

# List recent backups
log "Recent backups:"
find "${BACKUP_DIR}" -maxdepth 1 -type d -name "automaker-backup-*" -printf "%T@ %Tc %p\n" 2>/dev/null | sort -rn | head -10 | cut -d' ' -f2-

exit 0
