#!/bin/bash
# continue-work.sh — Stop hook that checks board state and continues if work remains.
# Reads feature.json files directly from disk (no API calls needed).
# Uses stop_hook_active guard to prevent infinite loops (one continuation per turn).
# Outputs JSON with decision (block/allow) and reason instead of exit 2.

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
BLOCKED=0
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
    blocked) BLOCKED=$((BLOCKED + 1)) ;;
    in_progress) IN_PROGRESS=$((IN_PROGRESS + 1)) ;;
    review) REVIEW=$((REVIEW + 1)) ;;
  esac
done

TOTAL=$((BACKLOG + IN_PROGRESS + REVIEW))

# Check for escalation case: all remaining features are blocked
if [ "$TOTAL" -eq 0 ] && [ "$BLOCKED" -gt 0 ]; then
  jq -n --arg reason "All $BLOCKED remaining features are blocked. Manual intervention required for dependency resolution or unblocking." \
    '{decision: "block", reason: $reason}'
  exit 0
fi

if [ "$TOTAL" -gt 0 ]; then
  jq -n --arg reason "Board has active work: ${BACKLOG} backlog, ${IN_PROGRESS} in-progress, ${REVIEW} in review. Continue processing." \
    '{decision: "block", reason: $reason}'
  exit 0
fi

# Board is clear — check Beads for high-priority work
BEADS_READY=0
BEADS_URGENT=0
if command -v bd &>/dev/null; then
  # Count ready beads (suppress errors if db is stale)
  BEADS_OUTPUT=$(bd ready --allow-stale 2>/dev/null || bd --sandbox ready 2>/dev/null || echo "")
  if [ -n "$BEADS_OUTPUT" ]; then
    BEADS_READY=$(echo "$BEADS_OUTPUT" | grep -c '^\d\.\|^[0-9]' 2>/dev/null || echo "0")
    BEADS_URGENT=$(echo "$BEADS_OUTPUT" | grep -c '\[● P[01]\]' 2>/dev/null || echo "0")
  fi
fi

if [ "$BEADS_URGENT" -gt 0 ]; then
  jq -n --arg reason "Beads has ${BEADS_URGENT} urgent items (P0/P1). Run 'bd ready' and work the queue." \
    '{decision: "block", reason: $reason}'
  exit 0
fi

# No board work, no urgent beads — check if we should run idle tasks
IDLE_COOLDOWN_FILE="/tmp/ava-idle-cooldown"
IDLE_COOLDOWN_SECONDS=600  # 10 minutes between idle cycles

if [ -f "$IDLE_COOLDOWN_FILE" ]; then
  LAST_IDLE=$(cat "$IDLE_COOLDOWN_FILE" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_IDLE))
  if [ "$ELAPSED" -lt "$IDLE_COOLDOWN_SECONDS" ]; then
    exit 0  # Cooldown active, allow stop
  fi
fi

# Set cooldown timestamp and trigger idle work cycle with structured task list
date +%s > "$IDLE_COOLDOWN_FILE"

IDLE_TASKS=$(cat <<'EOF'
Board is clear. Running idle work cycle:
- Check Linear for new initiatives or high-priority issues
- Review Beads backlog for operational tasks
- Run maintenance tasks (format check, dependency updates, security audit)
- Check for documentation drift (MEMORY.md, CLAUDE.md)
- Review open PRs for merge readiness
Next idle cycle in 10 minutes.
EOF
)

jq -n --arg reason "$IDLE_TASKS" \
  '{decision: "block", reason: $reason}'
exit 0
