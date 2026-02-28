#!/bin/bash
# check-mcp-health.sh — SessionStart hook for MCP health diagnostics.
# Checks if Automaker server is reachable and injects diagnostic context if not.
# Helps Claude recover from MCP tool failures caused by server downtime.

# Get plugin directory for auth
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PLUGIN_DIR}/.env"

# Load plugin env vars
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE" 2>/dev/null || true
  set +a
fi

# ── AUTOMAKER_ROOT check ──────────────────────────────────────────────────────
# Without AUTOMAKER_ROOT the MCP server binary cannot be located and all tools
# will silently fail. Surface a clear actionable error immediately.
if [ -z "${AUTOMAKER_ROOT:-}" ]; then
  echo ""
  echo "## Plugin Setup Required: AUTOMAKER_ROOT not set"
  echo ""
  echo "The plugin cannot locate the protoLabs MCP server. \`AUTOMAKER_ROOT\` must be"
  echo "set to the absolute path of your local protomaker repo clone."
  echo ""
  echo "**Fix:**"
  echo "1. Open \`${ENV_FILE}\` (copy from \`.env.example\` if it doesn't exist)"
  echo "2. Add: \`AUTOMAKER_ROOT=/absolute/path/to/protomaker\`"
  echo "3. Add: \`AUTOMAKER_API_KEY=your-dev-key-2026\`"
  echo "4. Restart Claude Code"
  echo ""
  echo "**Note:** All MCP tools (mcp__plugin_protolabs_studio__*) will be unavailable until this is fixed."
  exit 0
fi

MCP_BINARY="${AUTOMAKER_ROOT}/packages/mcp-server/dist/index.js"
if [ ! -f "$MCP_BINARY" ]; then
  echo ""
  echo "## Plugin Setup Required: MCP server not built"
  echo ""
  echo "AUTOMAKER_ROOT is set to \`${AUTOMAKER_ROOT}\` but the MCP server binary is missing."
  echo "Expected: \`${MCP_BINARY}\`"
  echo ""
  echo "**Fix:**"
  echo "  cd \"${AUTOMAKER_ROOT}\" && npm run build:packages"
  echo ""
  echo "**Note:** All MCP tools will be unavailable until the server is built."
  exit 0
fi

# ── Server reachability check ─────────────────────────────────────────────────
# Default to localhost:3008 (standard dev server)
API_BASE="${AUTOMAKER_API_URL:-http://localhost:3008}"
HEALTH_ENDPOINT="${API_BASE}/api/health"

# Try to reach the health endpoint (5 second timeout)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  -H "X-API-Key: ${AUTOMAKER_API_KEY}" \
  "${HEALTH_ENDPOINT}" 2>/dev/null)

# If server is unreachable or unhealthy, inject diagnostic context
if [ "$HTTP_CODE" != "200" ]; then
  echo ""
  echo "## MCP Server Unreachable"
  echo "Automaker server at ${API_BASE} is unreachable (HTTP ${HTTP_CODE:-timeout})."
  echo ""
  echo "**Common causes:**"
  echo "- Dev server not running — start it: \`cd ${AUTOMAKER_ROOT} && npm run dev:web\`"
  echo "- Server crashed or restarting"
  echo "- Wrong API URL (check AUTOMAKER_API_URL in \`${ENV_FILE}\`)"
  echo "- Auth failure (verify AUTOMAKER_API_KEY in \`${ENV_FILE}\` matches server)"
  echo ""
  echo "**Note:** All MCP tools (mcp__plugin_protolabs_studio__*) will fail until server is reachable."
  exit 0
fi

# Server is healthy - no output (don't spam context)
exit 0
