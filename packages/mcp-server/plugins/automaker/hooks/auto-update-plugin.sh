#!/bin/bash
# Auto-update plugin reminder
# Fires on Edit|Write PostToolUse - checks if edited file is in plugin directory.
# If so, logs a reminder to update the plugin.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Check if the edited file is inside the plugin directory
if [[ "$FILE_PATH" == *"packages/mcp-server/plugins/automaker"* ]]; then
  echo "Plugin file modified: $FILE_PATH - Remember to run 'claude plugin update automaker' to pick up changes." >&2
fi

exit 0
