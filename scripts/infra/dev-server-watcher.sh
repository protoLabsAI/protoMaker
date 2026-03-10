#!/usr/bin/env bash
# dev-server-watcher.sh — Poll git HEAD every 30s, rebuild and gracefully
# restart the headless dev server when dev branch moves forward.
#
# Usage:
#   ./scripts/infra/dev-server-watcher.sh
#
# Or via npm:
#   npm run dev:headless:watch

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER_DIR="$REPO_ROOT/apps/server"
POLL_INTERVAL=30
# Grace period (seconds) to wait for in-flight agent work before SIGKILL
GRACEFUL_TIMEOUT=60

SERVER_PID=""

log() {
  echo "[dev-watcher] $(date '+%H:%M:%S') $*"
}

start_server() {
  log "Starting headless server..."
  cd "$SERVER_DIR"
  NODE_ENV=production AUTO_MODE=true node dist/index.js &
  SERVER_PID=$!
  log "Server started (PID $SERVER_PID)"
  cd "$REPO_ROOT"
}

stop_server() {
  if [[ -z "$SERVER_PID" ]] || ! kill -0 "$SERVER_PID" 2>/dev/null; then
    log "Server not running, nothing to stop."
    SERVER_PID=""
    return
  fi

  log "Sending SIGTERM to server (PID $SERVER_PID) — waiting up to ${GRACEFUL_TIMEOUT}s for graceful shutdown..."
  kill -TERM "$SERVER_PID" 2>/dev/null || true

  local elapsed=0
  while kill -0 "$SERVER_PID" 2>/dev/null; do
    if [[ $elapsed -ge $GRACEFUL_TIMEOUT ]]; then
      log "Grace period elapsed — sending SIGKILL to PID $SERVER_PID"
      kill -KILL "$SERVER_PID" 2>/dev/null || true
      break
    fi
    sleep 1
    ((elapsed++))
  done

  wait "$SERVER_PID" 2>/dev/null || true
  log "Server stopped."
  SERVER_PID=""
}

rebuild() {
  log "Rebuilding packages and server..."
  cd "$REPO_ROOT"
  if npm run build:packages && npm run build --workspace=apps/server; then
    log "Build succeeded."
    return 0
  else
    log "Build FAILED — keeping current server running."
    return 1
  fi
}

cleanup() {
  log "Caught exit signal — shutting down server..."
  stop_server
  exit 0
}

trap cleanup INT TERM

# ── Initial build + start ──────────────────────────────────────────────────
log "Initial build..."
cd "$REPO_ROOT"
npm run build:packages && npm run build --workspace=apps/server
start_server

# ── Watch loop ─────────────────────────────────────────────────────────────
last_commit="$(git -C "$REPO_ROOT" rev-parse HEAD)"
log "Watching for new commits on dev (current HEAD: ${last_commit:0:8}). Polling every ${POLL_INTERVAL}s."

while true; do
  sleep "$POLL_INTERVAL"

  # If server died on its own, restart it without a rebuild
  if [[ -n "$SERVER_PID" ]] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
    log "Server process exited unexpectedly — restarting..."
    start_server
    continue
  fi

  current_commit="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  if [[ "$current_commit" != "$last_commit" ]]; then
    log "New commit detected: ${last_commit:0:8} → ${current_commit:0:8}"
    last_commit="$current_commit"

    stop_server
    if rebuild; then
      start_server
    else
      log "Skipping restart due to build failure. Will retry on next commit."
      start_server  # restart on old dist so agents aren't left without a server
    fi
  fi
done
