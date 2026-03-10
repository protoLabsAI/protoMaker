# Phase 4: Fix watch_pr Session Scoping and In-Chat Notification

*Ava Chat Interactive Toolkit > Interactive Tools*

PRWatcherService is fully implemented but broadcasts PR status updates to ALL clients instead of the originating chat session. Scope PR watch notifications to the sessionId that called watch_pr. When a PR status changes (merged, approved, changes requested), send an in-chat notification message back to that specific session rather than a global broadcast. Also fix the dead-end: if Ava says it will watch a PR, the tool should keep the conversation alive by posting a follow-up message when the PR resolves.

**Complexity:** medium

## Files to Modify

- apps/server/src/services/pr-watcher-service.ts
- apps/server/src/services/ava-tools.ts
- apps/server/src/routes/ava/

## Acceptance Criteria

- [ ] PR watch notifications are scoped to the originating session
- [ ] Other chat sessions do not receive PR notifications they did not request
- [ ] When a watched PR resolves, an in-chat message is sent to the correct session
- [ ] Ava does not dead-end after offering to watch a PR