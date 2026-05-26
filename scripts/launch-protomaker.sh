#!/usr/bin/env bash
#
# Launches protoMaker as a PRODUCTION build (server :3008 + UI :3007), the
# primary local instance. Invoked by the ai.protolabs.protomaker LaunchAgent at
# login and restarted on crash (KeepAlive).
#
# Why not `npm start`: that runs start-automaker.sh, an interactive TUI launcher
# (menu, spinners, TERM_COLS) that hangs / misbehaves headless under launchd
# with no terminal. This script runs the same production path non-interactively:
# build the prod artifacts, then serve the built server + UI preview.
#
# Build is turbo-cached, so it's near-instant when nothing changed and rebuilds
# on code changes — restart the agent to pick up new code:
#   launchctl kickstart -k gui/$(id -u)/ai.protolabs.protomaker
#
# Logs: logs/autostart.{out,err}.log (see the plist).

set -uo pipefail

REPO="$HOME/dev/protomaker"
cd "$REPO" || {
  echo "[launch-protomaker] FATAL: $REPO not found"
  exit 1
}

# LaunchAgents start with a minimal PATH and no nvm — source it for node 22.
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1 || true
command -v npm >/dev/null 2>&1 || {
  echo "[launch-protomaker] FATAL: npm not on PATH (nvm load failed?)"
  exit 1
}

# Load repo-root .env into the environment so server + UI inherit secrets
# regardless of each process's cwd (the server's dotenv fallback misses the root
# .env when run from the apps/server workspace dir, leaving it on the DEFAULT
# api key and with NO GATEWAY_API_KEY -> model calls 401). .env is plain
# KEY=value (no multiline/space values).
set -a
# shellcheck disable=SC1091
[ -f "$REPO/.env" ] && . "$REPO/.env"
set +a
export NODE_ENV=production

if [ -z "${GATEWAY_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "[launch-protomaker] WARNING: no GATEWAY_API_KEY/OPENAI_API_KEY in .env — model calls will 401"
fi

# Free our ports before starting. On a KeepAlive restart, concurrently doesn't
# always reap its server/vite children, so a stale listener can orphan and hold
# :3008/:3007 — the new instance then crash-loops on EADDRINUSE forever (seen
# with a 1h-old orphaned server). Killing any prior listener here makes restarts
# deterministic. Safe: only one protoMaker instance should ever own these ports.
for port in 3008 3007; do
  pids=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[launch-protomaker] freeing port $port (killing stale listener: $pids)"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done

echo "[launch-protomaker] $(date '+%Y-%m-%d %H:%M:%S') PROD build (node $(node -v 2>/dev/null), NODE_ENV=$NODE_ENV, api_key=${AUTOMAKER_API_KEY:+set}, gateway=${GATEWAY_API_KEY:+set})"

# Build production artifacts. turbo caches packages+server; vite build for UI.
if ! npm run build:packages \
  || ! npm run build --workspace=apps/server \
  || ! npm run build --workspace=apps/ui; then
  echo "[launch-protomaker] BUILD FAILED — see errlog"
  exit 1
fi

echo "[launch-protomaker] $(date '+%Y-%m-%d %H:%M:%S') build done — serving server :3008 + UI :3007"

# Serve the built server + UI preview. exec so launchd tracks concurrently
# directly; --kill-others-on-fail makes one process dying take down the other so
# KeepAlive cleanly restarts the whole stack.
exec "$REPO/node_modules/.bin/concurrently" \
  --kill-others-on-fail \
  --names "server,ui" \
  --prefix-colors "blue,green" \
  "npm run start --workspace=apps/server" \
  "npm run preview --workspace=apps/ui -- --port 3007 --host"
