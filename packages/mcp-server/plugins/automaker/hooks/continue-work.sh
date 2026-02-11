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

# Also count blocked features for escalation logic
BLOCKED=0
for dir in "$FEATURES_DIR"/*/; do
  [ -d "$dir" ] || continue
  feature_file="$dir/feature.json"
  [ -f "$feature_file" ] || continue

  is_epic=$(jq -r '.isEpic // false' "$feature_file" 2>/dev/null)
  [ "$is_epic" = "true" ] && continue

  status=$(jq -r '.status // empty' "$feature_file" 2>/dev/null)
  [ "$status" = "blocked" ] && BLOCKED=$((BLOCKED + 1))
done

TOTAL=$((BACKLOG + IN_PROGRESS + REVIEW))
ACTIONABLE=$TOTAL  # Features that can be worked on

# Check if ALL remaining features are blocked
if [ "$TOTAL" -eq 0 ] && [ "$BLOCKED" -gt 0 ]; then
  # Output JSON decision to block stop with escalation message
  cat <<EOF
{
  "hookSpecificOutput": {
    "decision": "block",
    "reason": "⚠️ Board blocked: ${BLOCKED} blocked features, 0 actionable. Review blocked features and unblock them, or escalate to Josh if dependencies are external."
  }
}
EOF
  exit 0
fi

if [ "$TOTAL" -gt 0 ]; then
  # Output JSON decision to block stop with work continuation message
  cat <<EOF
{
  "hookSpecificOutput": {
    "decision": "block",
    "reason": "Board has active work: ${BACKLOG} backlog, ${IN_PROGRESS} in-progress, ${REVIEW} in review. Continue processing."
  }
}
EOF
  exit 0
fi

# Board is clear — check if we should run idle tasks
IDLE_COOLDOWN_FILE="/tmp/ava-idle-cooldown"
IDLE_COOLDOWN_SECONDS=600  # 10 minutes between idle cycles

if [ -f "$IDLE_COOLDOWN_FILE" ]; then
  LAST_IDLE=$(cat "$IDLE_COOLDOWN_FILE" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_IDLE))
  if [ "$ELAPSED" -lt "$IDLE_COOLDOWN_SECONDS" ]; then
    # Allow stop (cooldown active)
    cat <<EOF
{
  "hookSpecificOutput": {
    "decision": "allow",
    "reason": "Idle cooldown active (${ELAPSED}s/${IDLE_COOLDOWN_SECONDS}s). Board clear."
  }
}
EOF
    exit 0
  fi
fi

# Set cooldown timestamp and trigger idle work
date +%s > "$IDLE_COOLDOWN_FILE"

# Output JSON decision to block stop with structured idle task list
cat <<EOF
{
  "hookSpecificOutput": {
    "decision": "block",
    "reason": "Board clear. Running idle cycle (next in ${IDLE_COOLDOWN_SECONDS}s):\n\n📋 **Idle Tasks:**\n• Check Linear for new initiatives or unassigned issues\n• Review Beads backlog for operational improvements\n• Run maintenance tasks (dependency updates, security audits)\n• Check for configuration drift or stale branches\n• Review recent PRs for follow-up work\n• Update documentation if needed"
  }
}
EOF
exit 0
