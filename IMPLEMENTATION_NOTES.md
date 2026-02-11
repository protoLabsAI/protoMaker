# Phase 2: Critical MCP Tools - Implementation Notes

## Overview
Added 3 new MCP tools for GitHub PR operations: `merge_pr`, `check_pr_status`, and `resolve_review_threads`.

## Files Created

### Server Routes
1. **apps/server/src/routes/github/routes/merge-pr.ts**
   - POST `/api/github/merge-pr` endpoint
   - Merges a PR using `githubMergeService.mergePR()`
   - Supports different strategies: merge, squash, rebase
   - Optionally waits for CI checks before merging

2. **apps/server/src/routes/github/routes/check-pr-status.ts**
   - POST `/api/github/check-pr-status` endpoint
   - Checks CI status using `githubMergeService.checkPRStatus()`
   - Returns passed/failed/pending check counts

### MCP Tools
Updated **packages/mcp-server/src/index.ts**:
- Added `merge_pr` tool definition (lines ~1135-1163)
- Added `check_pr_status` tool definition (lines ~1164-1181)
- Added `resolve_review_threads` tool definition (lines ~1182-1200)
- Added handlers in `handleTool` switch statement (lines ~1665-1680)

### Router Registration
Updated **apps/server/src/routes/github/index.ts**:
- Imported new handlers
- Registered routes at lines ~72-73

## API Endpoints

### 1. POST /api/github/merge-pr
Merges a pull request.

**Request:**
```json
{
  "projectPath": "/path/to/project",
  "prNumber": 123,
  "strategy": "squash",  // Optional: "merge" | "squash" | "rebase"
  "waitForCI": true      // Optional: default true
}
```

**Response:**
```json
{
  "success": true,
  "mergeCommitSha": "abc12345",
  // OR if failed:
  "error": "CI checks pending",
  "checksPending": true,
  "checksFailed": false,
  "failedChecks": []
}
```

### 2. POST /api/github/check-pr-status
Checks CI status of a PR.

**Request:**
```json
{
  "projectPath": "/path/to/project",
  "prNumber": 123
}
```

**Response:**
```json
{
  "success": true,
  "allChecksPassed": true,
  "passedCount": 5,
  "failedCount": 0,
  "pendingCount": 0,
  "failedChecks": []
}
```

### 3. POST /api/github/process-coderabbit-feedback
Processes CodeRabbit review comments (already existed, now exposed via MCP).

**Request:**
```json
{
  "projectPath": "/path/to/project",
  "prNumber": 123
}
```

**Response:**
```json
{
  "success": true,
  "featureId": "feature-123",
  "commentCount": 5
}
```

## MCP Tools Usage

### merge_pr
```typescript
mcp__automaker__merge_pr({
  projectPath: '/path/to/project',
  prNumber: 123,
  strategy: 'squash',
  waitForCI: true
})
```

### check_pr_status
```typescript
mcp__automaker__check_pr_status({
  projectPath: '/path/to/project',
  prNumber: 123
})
```

### resolve_review_threads
```typescript
mcp__automaker__resolve_review_threads({
  projectPath: '/path/to/project',
  prNumber: 123
})
```

## Testing

### Manual Testing
1. Ensure Automaker server is running
2. Ensure a GitHub repo with PRs exists
3. Test via MCP:
```bash
# List all tools (should show 53 tools now, was 50)
claude mcp test automaker

# Test merge_pr
mcp__automaker__merge_pr({
  projectPath: '/Users/kj/dev/automaker',
  prNumber: 123,
  strategy: 'squash',
  waitForCI: true
})
```

### Verification Checklist
- [x] Routes compile without TypeScript errors
- [x] MCP tools defined in packages/mcp-server/src/index.ts
- [x] MCP server builds successfully (dist/index.js contains new tools)
- [x] Tool count increased from 50 to 53
- [x] CLAUDE.md documentation updated to reflect 35 tools
- [x] All 3 tools follow existing patterns from other GitHub routes

## Notes

1. **Pre-existing TypeScript Error**: There is a pre-existing TS error in `pr-feedback-service.ts` line 386 that is unrelated to this implementation.

2. **Dependencies**: These tools rely on:
   - `GitHubMergeService` (apps/server/src/services/github-merge-service.ts)
   - `gh` CLI installed and authenticated
   - GitHub remote configured for the project

3. **Error Handling**: All routes include proper error handling and validation:
   - Check for GitHub remote before operations
   - Validate required parameters
   - Return meaningful error messages

4. **Pattern Consistency**: Implementation follows the same patterns as existing GitHub routes like `process-coderabbit-feedback.ts`.
