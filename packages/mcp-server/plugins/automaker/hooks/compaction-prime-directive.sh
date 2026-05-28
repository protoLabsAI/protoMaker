#!/bin/bash
# Compaction Prime Directive
# Injected after context compaction to restore Roxy's identity and project context.
# Output goes to stdout and is added to Claude's context.

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${PLUGIN_DIR}/data/ava-session-state.json"

# Resolve project path: saved state > AUTOMAKER_ROOT > git root
PROJECT_PATH=""
if [ -f "$STATE_FILE" ]; then
  PROJECT_PATH=$(jq -r '.projectPath // empty' "$STATE_FILE" 2>/dev/null)
fi
if [ -z "$PROJECT_PATH" ]; then
  PROJECT_PATH="${AUTOMAKER_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || echo 'unknown')}"
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

# Include saved board state if available
if [ -f "$STATE_FILE" ]; then
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
