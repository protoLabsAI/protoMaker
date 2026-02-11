#!/bin/bash
# check-mcp-health.sh — SessionStart hook for MCP health diagnostics.
# Checks if Automaker server is reachable and injects diagnostic context if not.
# Helps Claude recover from MCP tool failures caused by server downtime.

# Get plugin directory for auth
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PLUGIN_DIR}/.env"

# Load AUTOMAKER_API_KEY from plugin .env
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | grep AUTOMAKER_API_KEY | xargs)
fi

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
  echo "## ⚠️ MCP Server Health Check"
  echo "Automaker server at ${API_BASE} is unreachable (HTTP ${HTTP_CODE:-timeout})."
  echo ""
  echo "**Common causes:**"
  echo "- Dev server not running (check terminal where \`npm run dev:server\` should be running)"
  echo "- Server crashed or restarting"
  echo "- Wrong API_BASE URL (check AUTOMAKER_API_URL in plugin .env)"
  echo "- Auth failure (verify AUTOMAKER_API_KEY in plugin .env matches server)"
  echo ""
  echo "**Recovery steps:**"
  echo "1. Check if server is running: \`ps aux | grep 'node.*automaker'\`"
  echo "2. If not running, ask user to start it: \`npm run dev:server\` in /Users/kj/dev/automaker"
  echo "3. If running, check logs for crashes or errors"
  echo "4. Verify plugin .env has correct AUTOMAKER_API_KEY"
  echo ""
  echo "**Note:** All MCP tools (mcp__plugin_automaker_automaker__*) will fail until server is reachable."
  exit 0
fi

# Server is healthy - no output (don't spam context)
exit 0
