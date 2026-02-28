#!/bin/bash
# ava-monitor.sh — Periodic Ava activation via Claude Code headless mode
#
# Usage:
#   ./scripts/ava-monitor.sh              # Single monitoring pass
#   ./scripts/ava-monitor.sh --loop 300   # Loop every 300 seconds (5 min)
#
# Designed to be run via launchd, cron, or manually.
# Requires: claude CLI, AUTOMAKER_API_KEY in environment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_DIR/data/ava-monitor-logs"

mkdir -p "$LOG_DIR"

run_monitoring_pass() {
  local timestamp
  timestamp=$(date +%Y%m%d-%H%M%S)
  local log_file="$LOG_DIR/pass-$timestamp.log"

  echo "[$(date)] Starting Ava monitoring pass..." | tee "$log_file"

  cd "$PROJECT_DIR"

  claude -p "/ava" \
    --allowedTools "Bash(gh *),Bash(gt *),Bash(git *),Bash(npx prettier *),Read,Glob,Grep,mcp__plugin_protolabs_studio__*,mcp__plugin_protolabs_discord__*" \
    --output-format json \
    2>>"$log_file" | tee -a "$log_file" | jq -r '.result // "No result"' 2>/dev/null

  echo "[$(date)] Monitoring pass complete." | tee -a "$log_file"

  # Keep only last 100 log files
  ls -t "$LOG_DIR"/pass-*.log 2>/dev/null | tail -n +101 | xargs rm -f 2>/dev/null || true
}

if [[ "${1:-}" == "--loop" ]]; then
  interval="${2:-300}"
  echo "Starting Ava monitor loop (interval: ${interval}s)"
  while true; do
    run_monitoring_pass || echo "[$(date)] Monitoring pass failed, will retry..."
    sleep "$interval"
  done
else
  run_monitoring_pass
fi
