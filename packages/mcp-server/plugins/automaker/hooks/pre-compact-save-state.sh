#!/bin/bash
# Hook: pre-compact-save-state.sh
# Event: PreCompact
# Purpose: Save board state, current task, and PR pipeline before compaction
# to preserve operational context across context window compression.
# Reads directly from feature.json files on disk (no MCP access in hooks).

set -euo pipefail

PROJECT_ROOT="${AUTOMAKER_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
FEATURES_DIR="$PROJECT_ROOT/.automaker/features"
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${PLUGIN_DIR}/data"
STATE_FILE="${DATA_DIR}/ava-session-state.json"

mkdir -p "$DATA_DIR"

if [ ! -d "$FEATURES_DIR" ]; then
  exit 0
fi

# Count features by status
BACKLOG=0; IN_PROGRESS=0; REVIEW=0; DONE=0; BLOCKED=0; TOTAL=0
IN_PROGRESS_TITLES=""
REVIEW_TITLES=""

for dir in "$FEATURES_DIR"/*/; do
  [ -d "$dir" ] || continue
  feature_file="$dir/feature.json"
  [ -f "$feature_file" ] || continue

  TOTAL=$((TOTAL + 1))
  status=$(jq -r '.status // empty' "$feature_file" 2>/dev/null)
  title=$(jq -r '.title // "untitled"' "$feature_file" 2>/dev/null)
  case "$status" in
    backlog) BACKLOG=$((BACKLOG + 1)) ;;
    in_progress)
      IN_PROGRESS=$((IN_PROGRESS + 1))
      IN_PROGRESS_TITLES="${IN_PROGRESS_TITLES}$(jq -c '{id: .id, title: .title}' "$feature_file" 2>/dev/null),"
      ;;
    review)
      REVIEW=$((REVIEW + 1))
      REVIEW_TITLES="${REVIEW_TITLES}$(jq -c '{id: .id, title: .title}' "$feature_file" 2>/dev/null),"
      ;;
    done|verified) DONE=$((DONE + 1)) ;;
    blocked) BLOCKED=$((BLOCKED + 1)) ;;
  esac
done

# Clean trailing commas and wrap in arrays
IN_PROGRESS_TITLES="[${IN_PROGRESS_TITLES%,}]"
REVIEW_TITLES="[${REVIEW_TITLES%,}]"

BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")

# Count open PRs via gh if available
PR_COUNT=0
PR_LIST="[]"
if command -v gh &>/dev/null; then
  PR_LIST=$(gh pr list --state open --json number,title --limit 10 2>/dev/null || echo "[]")
  PR_COUNT=$(echo "$PR_LIST" | jq 'length' 2>/dev/null || echo 0)
fi

cat > "$STATE_FILE" <<EOJSON
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "event": "PreCompact",
  "branch": "$BRANCH",
  "board": {
    "total": $TOTAL,
    "backlog": $BACKLOG,
    "in_progress": $IN_PROGRESS,
    "review": $REVIEW,
    "done": $DONE,
    "blocked": $BLOCKED
  },
  "currentWork": $IN_PROGRESS_TITLES,
  "inReview": $REVIEW_TITLES,
  "prPipeline": {
    "count": $PR_COUNT,
    "prs": $PR_LIST
  }
}
EOJSON

echo "Session state saved before compaction: ${TOTAL} features (${BACKLOG} backlog, ${IN_PROGRESS} active, ${REVIEW} review, ${BLOCKED} blocked)"
