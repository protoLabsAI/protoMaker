#!/bin/bash
# session-context.sh — SessionStart hook for fresh sessions.
# Injects board summary so Ava/Claude starts with awareness of current state.
# Output goes to stdout and is added to Claude's context.

PROJECT_ROOT="${AUTOMAKER_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
FEATURES_DIR="$PROJECT_ROOT/.automaker/features"

# Get the plugin directory to access saved state
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${PLUGIN_DIR}/data/ava-session-state.json"

if [ ! -d "$FEATURES_DIR" ]; then
  exit 0
fi

# Count features by status
BACKLOG=0
IN_PROGRESS=0
REVIEW=0
BLOCKED=0
DONE=0
BLOCKED=0
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
    blocked) BLOCKED=$((BLOCKED + 1)) ;;
    done|verified) DONE=$((DONE + 1)) ;;
    blocked) BLOCKED=$((BLOCKED + 1)) ;;
  esac
done

BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")

echo "## Session Context"
echo "Project: $PROJECT_ROOT | Branch: $BRANCH"
echo "Board: ${TOTAL} features — ${BACKLOG} backlog, ${IN_PROGRESS} in-progress, ${REVIEW} review, ${BLOCKED} blocked, ${DONE} done"

if [ "$IN_PROGRESS" -gt 0 ] || [ "$REVIEW" -gt 0 ]; then
  echo "Active work detected — check agents and PRs."
fi

# Inject saved state from pre-compact hook if available
if [ -f "$STATE_FILE" ]; then
  SAVED_TS=$(jq -r '.timestamp // "unknown"' "$STATE_FILE" 2>/dev/null)
  CURRENT_WORK=$(jq -r '.currentWork // "[]"' "$STATE_FILE" 2>/dev/null)
  CURRENT_TASK=$(jq -r '.currentTask // "null"' "$STATE_FILE" 2>/dev/null)
  IN_REVIEW=$(jq -r '.inReview // "[]"' "$STATE_FILE" 2>/dev/null)
  PR_COUNT=$(jq -r '.prPipeline.count // 0' "$STATE_FILE" 2>/dev/null)
  PR_TITLES=$(jq -r '[.prPipeline.prs[]? | "#\(.number) \(.title)"] | join(", ")' "$STATE_FILE" 2>/dev/null)

  WORK_COUNT=$(echo "$CURRENT_WORK" | jq 'length' 2>/dev/null || echo 0)
  REVIEW_COUNT=$(echo "$IN_REVIEW" | jq 'length' 2>/dev/null || echo 0)
  HAS_TASK=$([ "$CURRENT_TASK" != "null" ] && [ "$CURRENT_TASK" != "[]" ] && echo 1 || echo 0)

  if [ "$WORK_COUNT" -gt 0 ] || [ "$REVIEW_COUNT" -gt 0 ] || [ "$PR_COUNT" -gt 0 ] || [ "$HAS_TASK" -eq 1 ]; then
    echo ""
    echo "## Restored State (pre-compaction: $SAVED_TS)"
    if [ "$WORK_COUNT" -gt 0 ]; then
      WORK_TITLES=$(echo "$CURRENT_WORK" | jq -r '[.[].title] | join(", ")' 2>/dev/null)
      echo "Was working on: $WORK_TITLES"
    fi
    if [ "$HAS_TASK" -eq 1 ]; then
      TASK_FEATURE=$(echo "$CURRENT_TASK" | jq -r '.feature // empty' 2>/dev/null)
      TASK_DESC=$(echo "$CURRENT_TASK" | jq -r '.description // empty' 2>/dev/null)
      if [ -n "$TASK_FEATURE" ]; then
        echo "Current task: $TASK_FEATURE"
        [ -n "$TASK_DESC" ] && echo "  Description: $TASK_DESC"
      fi
    fi
    if [ "$REVIEW_COUNT" -gt 0 ]; then
      REV_TITLES=$(echo "$IN_REVIEW" | jq -r '[.[].title] | join(", ")' 2>/dev/null)
      echo "In review: $REV_TITLES"
    fi
    if [ "$PR_COUNT" -gt 0 ] && [ -n "$PR_TITLES" ]; then
      echo "Open PRs: $PR_TITLES"
    fi
  fi
fi

exit 0
