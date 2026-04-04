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
  # Gate: only run npm install if node_modules is missing or corrupted.
  # This prevents an unconditional install on every restart from being interrupted
  # by SIGKILL (e.g. after an OOM event), which would leave tsx unrunnable.
  check_node_modules_health
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

check_node_modules_health() {
  # Verify that critical node_modules binaries exist before starting the server.
  # tsx/dist/preflight.cjs is the known corruption indicator: if it is missing,
  # an npm install was killed mid-way (e.g. by SIGKILL from a prior OOM event).
  # Only run npm install when the file is actually absent — not on every restart —
  # to avoid triggering another install that could itself be killed under memory
  # pressure.
  local tsx_preflight="$REPO_ROOT/node_modules/tsx/dist/preflight.cjs"
  if [[ ! -f "$tsx_preflight" ]]; then
    log "WARN: Critical binary missing: $tsx_preflight"
    log "node_modules appears corrupted (likely mid-install SIGKILL). Running npm install to repair..."
    cd "$REPO_ROOT"
    if ! npm install; then
      log "ERROR: npm install failed. Cannot start server."
      log "Manual intervention required: delete node_modules and re-run npm install."
      exit 1
    fi
    log "node_modules repaired successfully."
  fi
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
