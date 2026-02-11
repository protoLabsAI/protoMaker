#!/bin/bash
# Hook: session-end-save.sh
# Event: SessionEnd
# Purpose: Persist session summary when a session ends.
# Appends to JSONL log with board state snapshot for continuity tracking.

set -euo pipefail

PROJECT_ROOT="${AUTOMAKER_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
FEATURES_DIR="$PROJECT_ROOT/.automaker/features"
PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${PLUGIN_DIR}/data"
STATE_FILE="${DATA_DIR}/ava-session-state.json"
SESSION_LOG="${DATA_DIR}/session-history.jsonl"

mkdir -p "$DATA_DIR"

# Quick board count
BACKLOG=0; IN_PROGRESS=0; REVIEW=0; DONE=0; TOTAL=0
if [ -d "$FEATURES_DIR" ]; then
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
fi

BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Write to main state file (overwrite, for reading on next session start)
cat > "$STATE_FILE" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "event": "SessionEnd",
  "branch": "$BRANCH",
  "sessionSummary": "Session completed. Board: ${TOTAL} features (${BACKLOG} backlog, ${IN_PROGRESS} active, ${REVIEW} review, ${DONE} done)",
  "board": {
    "total": $TOTAL,
    "backlog": $BACKLOG,
    "inProgress": $IN_PROGRESS,
    "review": $REVIEW,
    "done": $DONE
  }
}
EOF

# Also append session record to JSONL history (one line per session)
echo "{\"timestamp\":\"$TIMESTAMP\",\"event\":\"SessionEnd\",\"branch\":\"$BRANCH\",\"board\":{\"total\":$TOTAL,\"backlog\":$BACKLOG,\"in_progress\":$IN_PROGRESS,\"review\":$REVIEW,\"done\":$DONE}}" >> "$SESSION_LOG"

# Keep log from growing unbounded — retain last 100 entries
if [ -f "$SESSION_LOG" ] && [ "$(wc -l < "$SESSION_LOG")" -gt 100 ]; then
  tail -100 "$SESSION_LOG" > "${SESSION_LOG}.tmp" && mv "${SESSION_LOG}.tmp" "$SESSION_LOG"
fi

echo "Session ended. Board: ${TOTAL} features (${BACKLOG} backlog, ${IN_PROGRESS} active, ${REVIEW} review, ${DONE} done)"
