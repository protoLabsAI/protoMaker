#!/usr/bin/env bash
# start-linear.sh — startup wrapper for the Linear MCP server.
# Validates required env vars before launching node.

set -euo pipefail

if [[ -z "${AUTOMAKER_ROOT:-}" ]]; then
  echo "[automaker/linear] AUTOMAKER_ROOT is not set." >&2
  echo "[automaker/linear] To fix this, create the plugin .env file:" >&2
  echo "[automaker/linear]   cp \"${BASH_SOURCE[0]%/hooks/*}/.env.example\" \"${BASH_SOURCE[0]%/hooks/*}/.env\"" >&2
  echo "[automaker/linear] Then set AUTOMAKER_ROOT to the absolute path of your protomaker clone." >&2
  echo "[automaker/linear] See docs/integrations/claude-plugin.md for full setup instructions." >&2
  exit 1
fi

DIST="${AUTOMAKER_ROOT}/packages/mcp-server/vendor/linear-mcp-server.js"

if [[ ! -f "$DIST" ]]; then
  echo "[automaker/linear] Linear MCP server not found at: $DIST" >&2
  echo "[automaker/linear] Did you run the build step? Try:" >&2
  echo "[automaker/linear]   cd \"$AUTOMAKER_ROOT\" && npm run build:packages" >&2
  exit 1
fi

exec node "$DIST" "$@"
