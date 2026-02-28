#!/bin/bash
# handle-mcp-failure.sh
# PostToolUseFailure hook for MCP tool diagnostics
# Fires when mcp__plugin_protolabs_studio__ tools fail

set -euo pipefail

# Extract tool name and error from hook context
TOOL_NAME="${TOOL_NAME:-unknown}"
ERROR_MESSAGE="${ERROR_MESSAGE:-No error message available}"
PROJECT_PATH="${PROJECT_PATH:-/Users/kj/dev/automaker}"

# Check if this is an MCP tool failure
if [[ ! "$TOOL_NAME" =~ ^mcp__plugin_protolabs_studio__ ]]; then
  exit 0  # Not an MCP tool, skip
fi

echo "⚠️  MCP Tool Failure Detected"
echo "Tool: $TOOL_NAME"
echo ""

# Diagnostic: Check if server is reachable
SERVER_URL="${SERVER_URL:-http://localhost:3008/api/health}"
if ! curl -s -f -m 5 "$SERVER_URL" > /dev/null 2>&1; then
  cat <<EOF
## Server Unreachable

The Automaker server at $SERVER_URL is not responding.

**Recovery Actions:**
1. Check if the dev server is running: \`ps aux | grep automaker\`
2. Restart the server: \`npm run dev\`
3. Verify port 3008 is not in use: \`lsof -ti:3008\`
4. Check server logs for startup errors

**Error Details:**
$ERROR_MESSAGE

EOF
  exit 0
fi

# Server is reachable, check for auth issues
if echo "$ERROR_MESSAGE" | grep -qi "unauthorized\|forbidden\|401\|403"; then
  cat <<EOF
## Authentication Failure

The server is running but authentication failed.

**Recovery Actions:**
1. Verify AUTOMAKER_API_KEY is set in plugin .env:
   \`cat $PROJECT_PATH/packages/mcp-server/plugins/automaker/.env | grep AUTOMAKER_API_KEY\`
2. Ensure it matches the server .env:
   \`cat $PROJECT_PATH/.env | grep AUTOMAKER_API_KEY\`
3. Restart Claude Code to reload plugin config

**Error Details:**
$ERROR_MESSAGE

EOF
  exit 0
fi

# Server is up and auth is OK, generic failure
cat <<EOF
## MCP Tool Error

The tool failed but the server is reachable.

**Recovery Actions:**
1. Check server logs: \`tail -50 $PROJECT_PATH/logs/server.log\`
2. Verify the tool parameters are valid
3. Try the operation again - may be transient
4. Check for TypeScript/build errors: \`npm run build:packages\`

**Error Details:**
$ERROR_MESSAGE

**Tool:** $TOOL_NAME

EOF
