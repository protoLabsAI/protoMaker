# Phase 2: Events and notifications MCP tools

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add 2 MCP tools: list_events (calls /api/event-history/list with filtering by type/feature/date), list_notifications (calls /api/notifications/list). Both routes exist, just need MCP wrappers in packages/mcp-server/src/index.ts following existing tool patterns.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/src/index.ts`

### Verification
- [ ] list_events returns filtered event history
- [ ] list_notifications returns unread notifications
- [ ] Both tools work via MCP test

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
