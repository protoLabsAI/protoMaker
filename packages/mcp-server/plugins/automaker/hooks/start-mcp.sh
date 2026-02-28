#!/usr/bin/env bash
# start-mcp.sh — startup wrapper for the Automaker MCP server.
# Validates required env vars before launching node.

set -euo pipefail

if [[ -z "${AUTOMAKER_ROOT:-}" ]]; then
  echo "[automaker] AUTOMAKER_ROOT is not set." >&2
  echo "[automaker] To fix this, create the plugin .env file:" >&2
  echo "[automaker]   cp \"${BASH_SOURCE[0]%/hooks/*}/.env.example\" \"${BASH_SOURCE[0]%/hooks/*}/.env\"" >&2
  echo "[automaker] Then set AUTOMAKER_ROOT to the absolute path of your protomaker clone." >&2
  echo "[automaker] See docs/integrations/claude-plugin.md for full setup instructions." >&2
  exit 1
fi

DIST="${AUTOMAKER_ROOT}/packages/mcp-server/dist/index.js"

if [[ ! -f "$DIST" ]]; then
  echo "[automaker] MCP server binary not found at: $DIST" >&2
  echo "[automaker] Did you run the build step? Try:" >&2
  echo "[automaker]   cd \"$AUTOMAKER_ROOT\" && npm run build:packages" >&2
  exit 1
fi

exec node "$DIST" "$@"
