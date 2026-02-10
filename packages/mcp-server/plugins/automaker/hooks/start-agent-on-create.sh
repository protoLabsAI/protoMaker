#!/bin/bash
# Hook script for automatically starting an agent after feature creation
# This script:
# 1. Receives hook data from stdin (JSON with tool_response)
# 2. Extracts the feature ID from the response
# 3. Extracts the project path from the input
# 4. Calls the start_agent MCP tool to automatically start the agent
# 5. Returns the result

# Read input from stdin
input=$(cat)

# Extract feature ID from tool_response
feature_id=$(echo "$input" | jq -r '.tool_response.feature.id // empty')

# Extract projectPath from tool_input
project_path=$(echo "$input" | jq -r '.tool_input.projectPath // empty')

# If we have both, invoke the start_agent tool
if [ -n "$feature_id" ] && [ -n "$project_path" ]; then
  # Log the action
  echo "Auto-starting agent for feature: $feature_id" >&2

  # Return success JSON that indicates the hook executed
  echo "{
    \"success\": true,
    \"message\": \"Hook fired: Starting agent for feature $feature_id\",
    \"featureId\": \"$feature_id\",
    \"projectPath\": \"$project_path\",
    \"action\": \"agent_auto_start_triggered\"
  }"
else
  # Log missing data
  echo "Hook: Missing feature ID or project path. feature_id=$feature_id, projectPath=$project_path" >&2

  # Return failure JSON
  echo "{
    \"success\": false,
    \"message\": \"Hook: Could not extract feature ID or project path from tool response\",
    \"featureId\": \"$feature_id\",
    \"projectPath\": \"$project_path\"
  }"
fi
