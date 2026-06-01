#!/bin/bash
# Compaction Prime Directive
# Injected after context compaction to restore Roxy's identity and project context.
# Output goes to stdout and is added to Claude's context.

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${PLUGIN_DIR}/data/ava-session-state.json"

# Resolve the project from THIS session's cwd (hook stdin JSON .cwd) > git toplevel.
# Deliberately NO AUTOMAKER_ROOT fallback and NO trust in the saved state file:
# AUTOMAKER_ROOT is exported globally (~/.zshenv, launchctl) pinned to one project
# for the MCP server, and the state file is a single shared blob (last project to
# compact wins) — either would make this directive fire in unrelated sessions.
if [ -t 0 ]; then
  INPUT=""
else
  INPUT="$(cat 2>/dev/null || true)"
fi
HOOK_CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)"
PROJECT_PATH="${HOOK_CWD:-$(git -C "${HOOK_CWD:-.}" rev-parse --show-toplevel 2>/dev/null)}"
PROJECT_PATH="${PROJECT_PATH:-$(git rev-parse --show-toplevel 2>/dev/null)}"

# Guard: only fire when THIS session is actually inside an automaker-managed project.
if [ -z "$PROJECT_PATH" ] || [ ! -d "$PROJECT_PATH/.automaker/features" ]; then
  exit 0
fi

echo "## POST-COMPACTION: MANDATORY OPERATOR RESTORATION"
echo ""
echo "Context was compacted. You MUST restore your operational identity immediately."
echo ""
echo "**MANDATORY ACTION:** Use the Skill tool to invoke \`protolabs:roxy\` with argument \`${PROJECT_PATH}\`."
echo "This restores your full Roxy context, delegation tree, monitoring checklist, and operational authority."
echo ""
echo "### Saved State"
echo "- **Project path:** ${PROJECT_PATH}"

# Include saved board state only if it belongs to THIS project (otherwise a stale
# blob from another project would print the wrong board into this session).
SAVED_PATH=""
[ -f "$STATE_FILE" ] && SAVED_PATH=$(jq -r '.projectPath // empty' "$STATE_FILE" 2>/dev/null)
if [ -f "$STATE_FILE" ] && [ "$SAVED_PATH" = "$PROJECT_PATH" ]; then
  BOARD_SUMMARY=$(jq -r '"- **Board:** \(.board.total) features (\(.board.backlog) backlog, \(.board.in_progress) active, \(.board.review) review, \(.board.blocked) blocked, \(.board.done) done)"' "$STATE_FILE" 2>/dev/null)
  BRANCH=$(jq -r '"- **Branch:** \(.branch)"' "$STATE_FILE" 2>/dev/null)
  PR_COUNT=$(jq -r '"- **Open PRs:** \(.prPipeline.count)"' "$STATE_FILE" 2>/dev/null)
  echo "$BRANCH"
  echo "$BOARD_SUMMARY"
  echo "$PR_COUNT"
fi

cat << 'RULES'

### Critical Rules (while restoring)
- NEVER restart the dev server
- NEVER `cd` into worktree directories
- Max 2-3 concurrent agents
- All MCP tool calls require `projectPath` parameter

### Do This Now
1. Invoke the Skill tool: `protolabs:roxy` (or `/roxy` if in the automaker repo)
2. The skill will restore your full operational context
3. Resume work from where you left off
RULES
