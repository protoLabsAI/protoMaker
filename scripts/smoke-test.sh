#!/usr/bin/env bash
# Post-deploy smoke tests for staging
# Tests critical API endpoints against a running server
# Usage: ./scripts/smoke-test.sh [base_url] [api_key]

set -euo pipefail

BASE_URL="${1:-http://localhost:3008}"
API_KEY="${2:-${AUTOMAKER_API_KEY:-}}"
DISCORD_WEBHOOK="${DISCORD_ALERTS_WEBHOOK:-}"

PASSED=0
FAILED=0
FAILURES=""

# Authenticate and get session cookie
SESSION_COOKIE=""
authenticate() {
  if [ -z "$API_KEY" ]; then
    echo "WARN: No API key provided, skipping authenticated tests"
    return 1
  fi

  local response
  response=$(curl -sf -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"apiKey\": \"${API_KEY}\"}" \
    --max-time 10 2>/dev/null) || return 1

  SESSION_COOKIE=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
  [ -n "$SESSION_COOKIE" ]
}

# Run a smoke test
# Args: test_name method endpoint [expected_field] [post_data]
smoke_test() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local expected_field="${4:-}"
  local data="${5:-}"

  local curl_args=(-sf -X "$method" "${BASE_URL}${endpoint}" --max-time 10)

  if [ -n "$SESSION_COOKIE" ]; then
    curl_args+=(-b "automaker_session=${SESSION_COOKIE}")
  fi
  if [ -n "$data" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$data")
  fi

  local response
  if response=$(curl "${curl_args[@]}" 2>/dev/null); then
    if [ -n "$expected_field" ]; then
      if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '${expected_field}' in d" 2>/dev/null; then
        echo "  PASS: ${name}"
        PASSED=$((PASSED + 1))
      else
        echo "  FAIL: ${name} (missing field: ${expected_field})"
        FAILED=$((FAILED + 1))
        FAILURES="${FAILURES}\n- ${name}: missing field '${expected_field}'"
      fi
    else
      echo "  PASS: ${name}"
      PASSED=$((PASSED + 1))
    fi
  else
    echo "  FAIL: ${name} (request failed)"
    FAILED=$((FAILED + 1))
    FAILURES="${FAILURES}\n- ${name}: request failed"
  fi
}

echo "Smoke Tests: ${BASE_URL}"
echo "================================"

# Phase 1: Basic health (no auth needed)
echo ""
echo "Health:"
smoke_test "GET /api/health" GET "/api/health" "status"

# Phase 2: Auth
echo ""
echo "Authentication:"
if authenticate; then
  echo "  PASS: Login with API key"
  PASSED=$((PASSED + 1))

  smoke_test "GET /api/auth/status" GET "/api/auth/status" "authenticated"
else
  echo "  SKIP: No API key or login failed"
fi

# Phase 3: Authenticated endpoints
if [ -n "$SESSION_COOKIE" ]; then
  echo ""
  echo "Protected Endpoints:"
  smoke_test "GET /api/health/detailed" GET "/api/health/detailed" "status"
  smoke_test "GET /api/settings/global" GET "/api/settings/global" "success"
  smoke_test "GET /api/setup/platform" GET "/api/setup/platform" "platform"
  smoke_test "GET /api/setup/claude-status" GET "/api/setup/claude-status"
  smoke_test "GET /api/models/available" GET "/api/models/available"
fi

# Results
echo ""
echo "================================"
echo "Results: ${PASSED} passed, ${FAILED} failed"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "Failures:"
  echo -e "$FAILURES"

  # Alert Discord if webhook configured
  if [ -n "$DISCORD_WEBHOOK" ]; then
    COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    MSG="Staging smoke tests FAILED (${FAILED}/$((PASSED + FAILED))): \`${COMMIT}\`\n${FAILURES}"
    curl -sf -H "Content-Type: application/json" \
      -d "{\"content\": \"${MSG}\"}" \
      "$DISCORD_WEBHOOK" 2>/dev/null || true
  fi

  exit 1
fi

echo "All smoke tests passed."
exit 0
