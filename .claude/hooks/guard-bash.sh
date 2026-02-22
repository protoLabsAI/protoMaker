#!/bin/bash
# Guard against dangerous bash patterns that can break Claude Code sessions.
#
# Rules enforced:
# 1. Never cd into .worktrees/ — if the worktree gets deleted, CWD becomes
#    invalid and posix_spawn fails for ALL subsequent commands (session death).
# 2. Never manage the dev server — user must control it manually.
# 3. Never force push to main or use --admin to bypass branch protection.
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
if echo "$STRIPPED" | grep -qE '(^[[:space:]]*|&&[[:space:]]*|\|\|[[:space:]]*|;[[:space:]]*)(npm run dev(:|[[:space:]]|$)|npx vite([[:space:]]|$)|node.*apps/server/src/index)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "BLOCKED: Never start, stop, or restart the dev server. Ask the user to manage it."
    }
  }'
  exit 0
fi

# Guard: force push to main (catches --force, -f, --force-with-lease targeting main/master)
if echo "$STRIPPED" | grep -qE 'git[[:space:]]+push[[:space:]].*(-f|--force|--force-with-lease)' && \
   echo "$STRIPPED" | grep -qE 'git[[:space:]]+push[[:space:]].*(main|master)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "BLOCKED: Never force push to main/master. This is destructive and can overwrite upstream history. Create a feature branch and open a PR instead."
    }
  }'
  exit 0
fi

# Guard: git push --force without explicit branch (could target main if checked out)
if echo "$STRIPPED" | grep -qE 'git[[:space:]]+push[[:space:]]+(-f|--force|--force-with-lease)[[:space:]]*$'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "BLOCKED: Force push without specifying a branch is dangerous — it may target main if that is the current branch. Specify the branch explicitly: git push --force origin <branch-name>"
    }
  }'
  exit 0
fi

# Guard: gh pr merge --admin (bypasses branch protection)
if echo "$STRIPPED" | grep -qE 'gh[[:space:]]+pr[[:space:]]+merge[[:space:]].*--admin'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "BLOCKED: Never use --admin to bypass branch protection. All PRs must pass required checks before merging."
    }
  }'
  exit 0
fi

# Guard: git push directly to main (non-force, but still bypasses PR workflow)
if echo "$STRIPPED" | grep -qE 'git[[:space:]]+push[[:space:]]+(origin[[:space:]]+)?(main|master)[[:space:]]*$'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "BLOCKED: Never push directly to main. Create a feature branch and open a PR."
    }
  }'
  exit 0
fi

# Allow everything else
exit 0
