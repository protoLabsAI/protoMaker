#!/bin/bash
# continue-work.sh — Stop hook that checks board state and continues if work remains.
# Reads feature.json files directly from disk (no API calls needed).
# Uses stop_hook_active guard to prevent infinite loops (one continuation per turn).

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // "false"')

# Guard: only continue ONCE per stop cycle to prevent infinite loops
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0  # Allow Claude to stop
fi

# Find project root
PROJECT_ROOT="${AUTOMAKER_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
FEATURES_DIR="$PROJECT_ROOT/.automaker/features"

if [ ! -d "$FEATURES_DIR" ]; then
  exit 0  # No features directory, allow stop
fi

# Count actionable (non-epic) features in active states
BACKLOG=0
IN_PROGRESS=0
REVIEW=0

for dir in "$FEATURES_DIR"/*/; do
  [ -d "$dir" ] || continue
  feature_file="$dir/feature.json"
  [ -f "$feature_file" ] || continue

  is_epic=$(jq -r '.isEpic // false' "$feature_file" 2>/dev/null)
  [ "$is_epic" = "true" ] && continue

  status=$(jq -r '.status // empty' "$feature_file" 2>/dev/null)
  case "$status" in
    backlog) BACKLOG=$((BACKLOG + 1)) ;;
    in_progress) IN_PROGRESS=$((IN_PROGRESS + 1)) ;;
    review) REVIEW=$((REVIEW + 1)) ;;
  esac
done

TOTAL=$((BACKLOG + IN_PROGRESS + REVIEW))

if [ "$TOTAL" -gt 0 ]; then
  echo "Board has active work: ${BACKLOG} backlog, ${IN_PROGRESS} in-progress, ${REVIEW} in review. Continue processing." >&2
  exit 2  # Block stop, continue working
fi

# Board is clear
exit 0
