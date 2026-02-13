#!/bin/bash
# Guard against dangerous bash patterns that can break Claude Code sessions.
#
# Rules enforced:
# 1. Never cd into .worktrees/ — if the worktree gets deleted, CWD becomes
#    invalid and posix_spawn fails for ALL subsequent commands (session death).
# 2. Never manage the dev server — user must control it manually.
#
# Uses jq to parse stdin JSON and outputs permissionDecision JSON on stdout.

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Strip heredoc content to avoid false positives from PR bodies, etc.
# Remove heredoc blocks: everything between <<'EOF' (or <<EOF) and EOF
STRIPPED=$(echo "$COMMAND" | sed '/<<.*EOF/,/^EOF/d; /<<.*END/,/^END/d')
# Strip quotes from arguments so "cd '.worktrees/foo'" still matches
STRIPPED=$(echo "$STRIPPED" | sed "s/['\"]//g")

# Guard: cd into worktree paths
# Anchored to command boundaries (^, &&, ||, ;) to avoid matching inside echo/strings
if echo "$STRIPPED" | grep -qE '(^[[:space:]]*|&&[[:space:]]*|\|\|[[:space:]]*|;[[:space:]]*)cd[[:space:]]+[^ ]*\.worktrees'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "BLOCKED: Never cd into worktree directories. If the worktree is deleted while it is your CWD, ALL bash commands fail for the rest of the session (kernel posix_spawn ENOENT). Use absolute paths or git -C <path> instead."
    }
  }'
  exit 0
fi

# Guard: dev server management (anchored to command boundaries)
if echo "$STRIPPED" | grep -qE '(^[[:space:]]*|&&[[:space:]]*|\|\|[[:space:]]*|;[[:space:]]*)(npm run dev|npx vite|node.*apps/server/src/index)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "BLOCKED: Never start, stop, or restart the dev server. Ask the user to manage it."
    }
  }'
  exit 0
fi

# Allow everything else
exit 0
