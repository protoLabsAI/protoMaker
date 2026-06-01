#!/usr/bin/env bash
# start-mcp.sh — startup wrapper for the Automaker MCP server.
#
# Self-locating: the repo root is derived from this script's own path, so the
# plugin needs NO globally-exported AUTOMAKER_ROOT. (Exporting it globally leaked
# the project's identity into every shell + Claude Code session via the plugin
# hooks — see git history.) Secrets/overrides come from the local .env beside the
# plugin, not the ambient environment.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)" # packages/mcp-server/plugins/automaker

# Load local secrets/overrides if present (AUTOMAKER_API_KEY, GH_TOKEN, tokens…).
if [[ -f "$PLUGIN_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PLUGIN_DIR/.env"
  set +a
fi

# Repo root is authoritative from this script's location — not ambient env, not a
# hardcoded path in .env. Layout: <root>/packages/mcp-server/plugins/automaker/hooks
AUTOMAKER_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
export AUTOMAKER_ROOT

DIST="${AUTOMAKER_ROOT}/packages/mcp-server/dist/index.js"

if [[ ! -f "$DIST" ]]; then
  echo "[automaker] MCP server binary not found at: $DIST" >&2
  echo "[automaker] Did you run the build step? Try:" >&2
  echo "[automaker]   cd \"$AUTOMAKER_ROOT\" && npm run build:packages" >&2
  exit 1
fi

exec node "$DIST" "$@"
