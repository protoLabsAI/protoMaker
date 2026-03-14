#!/bin/bash
# Auto-start agent on feature creation
# PostToolUse hook: when create_feature succeeds, automatically start an agent.
#
# Guards:
# - Only fires on create_feature MCP tool
# - Skips epics (container features, no agent needed)
# - Skips features with status "backlog" that have dependencies (let auto-mode handle ordering)
# - Requires AUTOMAKER_API_KEY and AUTOMAKER_API_URL

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only match create_feature
if [[ "$TOOL_NAME" != *"create_feature"* ]]; then
  exit 0
fi

# Extract tool_response — it's a JSON string with the MCP result
# The response structure varies: could be in .tool_response directly or .tool_response.content[0].text
RESPONSE_TEXT=$(echo "$INPUT" | jq -r '
  if .tool_response | type == "string" then .tool_response
  elif .tool_response.content then (.tool_response.content[0].text // empty)
  elif .tool_response.text then .tool_response.text
  else (.tool_response | tostring)
  end // empty
')

if [[ -z "$RESPONSE_TEXT" ]]; then
  exit 0
fi

# Check if the creation was successful
SUCCESS=$(echo "$RESPONSE_TEXT" | jq -r '.success // false')
if [[ "$SUCCESS" != "true" ]]; then
  exit 0
fi

# Extract feature data
FEATURE_ID=$(echo "$RESPONSE_TEXT" | jq -r '.feature.id // empty')
IS_EPIC=$(echo "$RESPONSE_TEXT" | jq -r '.feature.isEpic // false')
STATUS=$(echo "$RESPONSE_TEXT" | jq -r '.feature.status // "backlog"')
DEPS=$(echo "$RESPONSE_TEXT" | jq -r '.feature.dependencies // [] | length')
TITLE=$(echo "$RESPONSE_TEXT" | jq -r '.feature.title // "unknown"')

if [[ -z "$FEATURE_ID" ]]; then
  exit 0
fi

# Skip epics
if [[ "$IS_EPIC" == "true" ]]; then
  exit 0
fi

# Skip features with dependencies (auto-mode handles ordering)
if [[ "$DEPS" -gt 0 ]]; then
  exit 0
fi

# Extract projectPath from tool_input
PROJECT_PATH=$(echo "$INPUT" | jq -r '.tool_input.projectPath // empty')
if [[ -z "$PROJECT_PATH" ]]; then
  exit 0
fi

# Load API config from plugin .env
PLUGIN_DIR="$(dirname "$0")/.."
if [[ -f "$PLUGIN_DIR/.env" ]]; then
  # Source only the vars we need (avoid overwriting shell env)
  API_KEY=$(grep -E '^AUTOMAKER_API_KEY=' "$PLUGIN_DIR/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
  API_URL=$(grep -E '^AUTOMAKER_API_URL=' "$PLUGIN_DIR/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

# Fallback to env vars
API_KEY="${API_KEY:-$AUTOMAKER_API_KEY}"
API_URL="${API_URL:-${AUTOMAKER_API_URL:-http://localhost:3008}}"

if [[ -z "$API_KEY" ]]; then
  echo "Auto-start skipped: no AUTOMAKER_API_KEY available"
  exit 0
fi

# Start the agent via API
RESULT=$(curl -s -X POST "${API_URL}/api/auto-mode/run-feature" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -d "{\"projectPath\":\"${PROJECT_PATH}\",\"featureId\":\"${FEATURE_ID}\",\"useWorktrees\":true}" \
  2>/dev/null)

START_SUCCESS=$(echo "$RESULT" | jq -r '.success // false' 2>/dev/null)

if [[ "$START_SUCCESS" == "true" ]]; then
  echo "Agent auto-started for feature: ${TITLE} (${FEATURE_ID})"
else
  ERROR=$(echo "$RESULT" | jq -r '.error // "unknown error"' 2>/dev/null)
  echo "Agent auto-start failed for ${TITLE}: ${ERROR}"
fi

exit 0
