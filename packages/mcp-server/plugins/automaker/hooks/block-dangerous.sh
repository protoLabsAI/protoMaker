#!/bin/bash
# block-dangerous.sh — PreToolUse safety guard for Bash commands.
# Blocks catastrophic operations that could destroy data or break the environment.
# Only blocks truly dangerous patterns — not cautionary ones.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block destructive filesystem operations (rm -rf / or ~, but not /tmp or /specific/path)
if echo "$COMMAND" | grep -qE 'rm\s+-rf\s+(/\s|/;|/$|~|"\$HOME"|\$HOME/?\s|\.\.)'; then
  echo "Blocked: destructive rm -rf targeting root, home, or parent directory" >&2
  exit 2
fi

# Block force push to main/master
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force.*\s+(main|master)'; then
  echo "Blocked: force push to main/master" >&2
  exit 2
fi
if echo "$COMMAND" | grep -qE 'git\s+push\s+-f\s+.*\s+(main|master)'; then
  echo "Blocked: force push to main/master" >&2
  exit 2
fi

# Block hard reset that wipes working tree
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  echo "Blocked: git reset --hard destroys uncommitted work" >&2
  exit 2
fi

# Block git checkout . or git restore . (wipes all unstaged changes)
if echo "$COMMAND" | grep -qE 'git\s+(checkout|restore)\s+\.$'; then
  echo "Blocked: git checkout/restore . wipes all unstaged changes" >&2
  exit 2
fi

# Block git clean -f (deletes untracked files)
if echo "$COMMAND" | grep -qE 'git\s+clean\s+-[a-zA-Z]*f'; then
  echo "Blocked: git clean -f deletes untracked files permanently" >&2
  exit 2
fi

# Block database destruction
if echo "$COMMAND" | grep -qiE '(DROP\s+(TABLE|DATABASE)|TRUNCATE\s+TABLE)'; then
  echo "Blocked: destructive database operation" >&2
  exit 2
fi

# Block disk-level destruction
if echo "$COMMAND" | grep -qE '(mkfs|dd\s+if=)'; then
  echo "Blocked: disk-level destructive operation" >&2
  exit 2
fi

exit 0
