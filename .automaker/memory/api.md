---
tags: [api]
summary: api implementation decisions and patterns
relevantTo: [api]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 9
  referenced: 3
  successfulFeatures: 3
---
# api

### Using GitHub GraphQL API with resolveReviewThread mutation rather than REST API for thread resolution (2026-02-10)
- **Context:** Need to fetch thread list and resolve threads programmatically
- **Why:** GraphQL provides single query to fetch all thread data with author info (needed to filter bots). Native `resolveReviewThread` mutation is more reliable than trying to construct REST endpoints. Better performance than N+1 REST calls (fetch all threads, then resolve each one)
- **Rejected:** REST API - no single endpoint for bulk thread operations. Would require: fetch threads via REST, filter locally, then resolve each via separate REST call
- **Trade-offs:** Easier: single round-trip, native mutation. Harder: requires GraphQL query knowledge, `gh api` graphql syntax
- **Breaking if changed:** If switched back to REST API, would need to restructure as multiple sequential calls and handle pagination manually

### mergePR() call passes waitForCI: true by default (from settings), causing merge to block until CI checks complete (2026-02-10)
- **Context:** Merge should only happen when CI passes. GitHub branch protection requires status checks to pass before merge. Implementation needed to respect pending checks.
- **Why:** Avoids race condition where merge executes before CI finish. GitHub API will reject merge if checks aren't done - blocking the caller. waitForCI:true polls GitHub and waits.
- **Rejected:** Alternative: Always merge immediately without waiting. GitHub API rejects the request if checks pending. Merge fails, feature gets marked blocked, retry needed.
- **Trade-offs:** Easier: Single mergePR() call handles complete flow. Harder: Blocks until CI completes (could be minutes), increases EM agent execution time.
- **Breaking if changed:** If waitForCI is hardcoded false, merge frequently fails due to pending checks. Features marked blocked incorrectly (not a real block, just timing). Retry logic becomes mandatory.

### Use 409 Conflict for 'cannot delete worktree because agent is running' rather than 400 Bad Request or 403 Forbidden. (2026-02-10)
- **Context:** DELETE /api/worktree/delete route needed to distinguish between invalid input vs. resource conflict.
- **Why:** 409 Conflict semantically matches the situation: client request is valid but cannot be processed because of a conflict with existing state (running agent). 400 suggests malformed request. 403 suggests permission denied. 409 is RFC-correct for 'operation conflicts with current state'.
- **Rejected:** 400 Bad Request - wrong because the request IS well-formed. 403 Forbidden - wrong because it's not a permission issue, it's a state conflict. 423 Locked - less common, doesn't convey the reason clearly.
- **Trade-offs:** Client must understand 409 semantics to handle it properly (current state conflict, not client error). More precise HTTP semantics = better for API consumers and debugging.
- **Breaking if changed:** Clients that check for 'not 409' to allow deletion will incorrectly skip safety check if code changes to use different status code.

#### [Gotcha] DiscordBotService.sendToChannel() returns boolean, not DiscordOperationResult. Error handling requires wrapping the method or adding explicit error logging. (2026-02-12)
- **Situation:** Replacing discordService.sendMessage() (which returned detailed DiscordOperationResult with status, error, attempt info) with discordBotService.sendToChannel() (which returns simple boolean) loses detailed error information.
- **Root cause:** DiscordBotService is simpler and more focused - it either sends or doesn't. The complexity of DiscordOperationResult was more relevant for the stub service's retry logic.
- **How to avoid:** Simpler return value and cleaner call sites, but less visibility into why Discord posting failed. Mitigation: Any failures are logged inside DiscordBotService, not in the caller.

#### [Pattern] Flattened payload shapes (extract nested values to top level) improve handler clarity and reduce destructuring complexity (2026-02-12)
- **Problem solved:** Original payload had messages: [{content, attachments, timestamp}]. New payload has content directly at top level. Handler only needs content, so nesting was unnecessary.
- **Why this works:** Simpler handler code, clearer intent, less defensive programming needed. Also matches what agent-discord-router actually needs (just the string content).
- **Trade-offs:** Flattened payload = less flexibility if multiple message formats needed in future, but Discord thread messages are always single-message events anyway. Gained simplicity, lost generality (acceptable trade here).

### DiscordBotService.sendToChannel() returns boolean for success/failure rather than throwing exceptions. EventHookService handles false returns by logging warning but not throwing. (2026-02-12)
- **Context:** Hookable event system where Discord failure shouldn't block event processing. User-configured hooks are best-effort notifications.
- **Why:** Returning boolean for known failure states (channel not found, bot lacks permissions) allows callers to decide response. Throwing only on unexpected errors (network failure, service crash) preserves the distinction.
- **Rejected:** Throwing on all failures (including permission denied) would require try-catch everywhere and could crash event loops. Always throwing makes Discord optional by requiring every caller to handle Discord.
- **Trade-offs:** Boolean returns require explicit null checks but allow graceful degradation. Exception-based errors are harder to ignore accidentally, but force coupling to Discord error handling.
- **Breaking if changed:** If behavior changes to throw on every failure, event processing could crash if Discord is unreachable. If behavior changes to never throw, unexpected errors (service crash) become silent and undetectable.