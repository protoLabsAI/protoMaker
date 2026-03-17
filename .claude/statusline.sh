#!/bin/bash
# protoLabs Studio Status Line
# Shows board state, auto-mode, and agent activity for the current project.
# Portable — drop into any project's .claude/ directory.

input=$(cat)
PROJECT_DIR=$(echo "$input" | jq -r '.workspace.project_dir // .cwd // "."')

# ── Colors ────────────────────────────────────────────────────────────
C='\033[36m'  G='\033[32m'  Y='\033[33m'  R='\033[31m'
B='\033[34m'  M='\033[35m'  D='\033[2m'  BD='\033[1m'  X='\033[0m'

# ── protoLabs API (cached 10s) ───────────────────────────────────────
CACHE="/tmp/protolabs-sl-$(echo "$PROJECT_DIR" | md5sum | cut -c1-8)"
STALE=10

is_stale() {
    [ ! -f "$CACHE" ] || \
    [ $(($(date +%s) - $(stat -c %Y "$CACHE" 2>/dev/null || stat -f %m "$CACHE" 2>/dev/null || echo 0))) -gt $STALE ]
}

if is_stale; then
    API="http://localhost:3008"
    KEY="automaker-staging-key-2026"
    HDR=(-H "Content-Type: application/json" -H "X-API-Key: $KEY")
    BODY="{\"projectPath\":\"$PROJECT_DIR\"}"

    # Features list
    FEAT=$(curl -s --max-time 2 -X POST "$API/api/features/list" "${HDR[@]}" -d "$BODY" 2>/dev/null)

    if [ -n "$FEAT" ] && echo "$FEAT" | jq -e '.success' > /dev/null 2>&1; then
        BK=$(echo "$FEAT" | jq '[.features[] | select(.status == "backlog")] | length')
        IP=$(echo "$FEAT" | jq '[.features[] | select(.status == "in_progress")] | length')
        RV=$(echo "$FEAT" | jq '[.features[] | select(.status == "review")] | length')
        BL=$(echo "$FEAT" | jq '[.features[] | select(.status == "blocked")] | length')
        DN=$(echo "$FEAT" | jq '[.features[] | select(.status == "done")] | length')

        # Auto-mode
        AUTO=$(curl -s --max-time 2 -X POST "$API/api/auto-mode/status" "${HDR[@]}" -d "$BODY" 2>/dev/null)
        AR=$(echo "$AUTO" | jq -r '.isAutoLoopRunning // false' 2>/dev/null)
        AC=$(echo "$AUTO" | jq -r '.runningCount // 0' 2>/dev/null)
        MX=$(echo "$AUTO" | jq -r '.maxConcurrency // 0' 2>/dev/null)

        # Running agent names
        AGENTS=$(echo "$AUTO" | jq -r '[.runningFeatures[]?.title // empty] | join(", ")' 2>/dev/null)

        echo "${BK}|${IP}|${RV}|${BL}|${DN}|${AR}|${AC}|${MX}|${AGENTS}" > "$CACHE"
    else
        echo "offline||||||||" > "$CACHE"
    fi
fi

IFS='|' read -r S_BK S_IP S_RV S_BL S_DN S_AUTO S_AC S_MX S_AGENTS < "$CACHE"

# ── Offline fallback ──────────────────────────────────────────────────
if [ "$S_BK" = "offline" ]; then
    echo -e "${D}protoLabs ${R}server offline${X}"
    exit 0
fi

# ── Build status line ─────────────────────────────────────────────────
# Auto-mode indicator
if [ "$S_AUTO" = "true" ]; then
    AUTO_STR="${G}${BD}AUTO${X} ${D}(${S_AC}/${S_MX})${X}"
else
    AUTO_STR="${D}auto:off${X}"
fi

# Board counts (only show non-zero)
BOARD=""
[ "$S_IP" != "0" ] && BOARD="${C}${S_IP} wip${X}"
[ "$S_RV" != "0" ] && BOARD="${BOARD:+$BOARD  }${B}${S_RV} pr${X}"
[ "$S_BL" != "0" ] && BOARD="${BOARD:+$BOARD  }${R}${S_BL} blocked${X}"
[ "$S_BK" != "0" ] && BOARD="${BOARD:+$BOARD  }${Y}${S_BK} queued${X}"
[ "$S_DN" != "0" ] && BOARD="${BOARD:+$BOARD  }${G}${S_DN} done${X}"

# Line 1: auto-mode + board
echo -e "${M}protoLabs${X} $AUTO_STR  $BOARD"

# Line 2: running agents (if any)
if [ -n "$S_AGENTS" ] && [ "$S_AGENTS" != "" ]; then
    echo -e "${D}agents:${X} ${M}${S_AGENTS}${X}"
fi
