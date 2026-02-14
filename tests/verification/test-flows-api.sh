#!/bin/bash

# Simple verification script for flows API endpoints
# Run this after starting the server with: npm run dev:web

API_URL="${AUTOMAKER_API_URL:-http://localhost:3008}"
API_KEY="${AUTOMAKER_API_KEY:-test-key}"

echo "Testing Antagonistic Review Flow API..."
echo "API URL: $API_URL"
echo ""

# Test 1: Execute endpoint - missing projectPath
echo "Test 1: POST /api/flows/antagonistic-review/execute - missing projectPath"
curl -s -X POST "$API_URL/api/flows/antagonistic-review/execute" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "prd": {
      "situation": "Test",
      "problem": "Test",
      "approach": "Test",
      "results": "Test"
    }
  }' | jq .
echo ""

# Test 2: Execute endpoint - missing prd
echo "Test 2: POST /api/flows/antagonistic-review/execute - missing prd"
curl -s -X POST "$API_URL/api/flows/antagonistic-review/execute" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "projectPath": "/tmp/test"
  }' | jq .
echo ""

# Test 3: Execute endpoint - invalid PRD (missing fields)
echo "Test 3: POST /api/flows/antagonistic-review/execute - invalid PRD"
curl -s -X POST "$API_URL/api/flows/antagonistic-review/execute" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "projectPath": "/tmp/test",
    "prd": {
      "situation": "Test"
    }
  }' | jq .
echo ""

# Test 4: Resume endpoint - missing threadId
echo "Test 4: POST /api/flows/antagonistic-review/resume - missing threadId"
curl -s -X POST "$API_URL/api/flows/antagonistic-review/resume" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "hitlFeedback": "Approve"
  }' | jq .
echo ""

# Test 5: Resume endpoint - missing hitlFeedback
echo "Test 5: POST /api/flows/antagonistic-review/resume - missing hitlFeedback"
curl -s -X POST "$API_URL/api/flows/antagonistic-review/resume" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "threadId": "test-123"
  }' | jq .
echo ""

# Test 6: Resume endpoint - valid but not implemented
echo "Test 6: POST /api/flows/antagonistic-review/resume - not implemented"
curl -s -X POST "$API_URL/api/flows/antagonistic-review/resume" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "threadId": "test-123",
    "hitlFeedback": "Approve with modifications"
  }' | jq .
echo ""

echo "✅ Verification complete! Check the responses above."
