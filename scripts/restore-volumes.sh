#!/bin/bash
# Automaker Volume Restore Script
# Restores Docker volumes from a backup
#
# Usage:
#   ./scripts/restore-volumes.sh <backup-dir>
#
# Example:
#   ./scripts/restore-volumes.sh ./backups/automaker-backup-20260205_020000

set -euo pipefail

# Configuration
BACKUP_PATH="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
  echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
  echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Validate arguments
if [ -z "${BACKUP_PATH}" ]; then
  error "Usage: $0 <backup-dir>"
  echo "Example: $0 ./backups/automaker-backup-20260205_020000"
  exit 1
fi

if [ ! -d "${BACKUP_PATH}" ]; then
  error "Backup directory does not exist: ${BACKUP_PATH}"
  exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  error "Docker is not running"
  exit 1
fi

# Read metadata
if [ ! -f "${BACKUP_PATH}/metadata.json" ]; then
  error "Invalid backup: metadata.json not found"
  exit 1
fi

log "Restoring from: ${BACKUP_PATH}"
log "Backup metadata:"
cat "${BACKUP_PATH}/metadata.json"

# Confirm with user
read -r -p "This will OVERWRITE existing volumes. Continue? (yes/no): " confirm
if [ "${confirm}" != "yes" ]; then
  log "Restore cancelled"
  exit 0
fi

# Check if any backup files exist
shopt -s nullglob
backup_files=("${BACKUP_PATH}"/*.tar.gz)
shopt -u nullglob

if [ ${#backup_files[@]} -eq 0 ]; then
  error "No backup files found in ${BACKUP_PATH}"
  exit 1
fi

# Restore each backup archive
for backup_file in "${backup_files[@]}"; do
  volume_name=$(basename "${backup_file}" .tar.gz)

  log "Restoring volume: ${volume_name}"

  # Create volume if it doesn't exist
  if ! docker volume inspect "${volume_name}" > /dev/null 2>&1; then
    log "Creating volume ${volume_name}"
    docker volume create "${volume_name}"
  else
    warn "Volume ${volume_name} already exists, will overwrite"
  fi

  # Restore using alpine container
  if docker run --rm \
    -v "${volume_name}:/target" \
    -v "${BACKUP_PATH}:/backup:ro" \
    alpine \
    sh -c "rm -rf /target/* /target/.[!.]* ; tar xzf /backup/${volume_name}.tar.gz -C /target"; then
    log "✓ Restored ${volume_name}"
  else
    error "✗ Failed to restore ${volume_name}"
  fi
done

log "Restore complete"
log "Restart Automaker services to use restored data:"
log "  docker-compose down && docker-compose up -d"

exit 0
