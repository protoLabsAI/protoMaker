#!/bin/bash
# session-context.sh — SessionStart hook for fresh sessions.
# Injects board summary so Ava/Claude starts with awareness of current state.
# Output goes to stdout and is added to Claude's context.

PROJECT_ROOT="${AUTOMAKER_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
FEATURES_DIR="$PROJECT_ROOT/.automaker/features"

if [ ! -d "$FEATURES_DIR" ]; then
  exit 0
fi

# Count features by status
BACKLOG=0
IN_PROGRESS=0
REVIEW=0
DONE=0
TOTAL=0

for dir in "$FEATURES_DIR"/*/; do
  [ -d "$dir" ] || continue
  feature_file="$dir/feature.json"
  [ -f "$feature_file" ] || continue

  TOTAL=$((TOTAL + 1))
  status=$(jq -r '.status // empty' "$feature_file" 2>/dev/null)
  case "$status" in
    backlog) BACKLOG=$((BACKLOG + 1)) ;;
    in_progress) IN_PROGRESS=$((IN_PROGRESS + 1)) ;;
    review) REVIEW=$((REVIEW + 1)) ;;
    done|verified) DONE=$((DONE + 1)) ;;
  esac
done

BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")

echo "## Session Context"
echo "Project: $PROJECT_ROOT | Branch: $BRANCH"
echo "Board: ${TOTAL} features — ${BACKLOG} backlog, ${IN_PROGRESS} in-progress, ${REVIEW} review, ${DONE} done"

if [ "$IN_PROGRESS" -gt 0 ] || [ "$REVIEW" -gt 0 ]; then
  echo "Active work detected — check agents and PRs."
fi

exit 0
