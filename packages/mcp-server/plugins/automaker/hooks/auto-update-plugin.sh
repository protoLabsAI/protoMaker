#!/bin/bash
# Auto-update plugin reminder
# Fires on Edit|Write PostToolUse - checks if edited file is in plugin directory.
# If so, logs a reminder to update the plugin.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Check if the edited file is inside the plugin directory
if [[ "$FILE_PATH" == *"packages/mcp-server/plugins/automaker"* ]]; then
  # Use stdout so Claude sees this in context (stderr is only visible in verbose mode)
  echo "Plugin file modified: $FILE_PATH — Run 'claude plugin update protolabs' to pick up changes."
  # hooks.json changes require full reinstall: uninstall + install
  if [[ "$FILE_PATH" == *"hooks.json"* ]] || [[ "$FILE_PATH" == *"hooks/"* ]]; then
    echo "Hook file modified — requires plugin REINSTALL (uninstall + install), not just update."
  fi
fi

exit 0
