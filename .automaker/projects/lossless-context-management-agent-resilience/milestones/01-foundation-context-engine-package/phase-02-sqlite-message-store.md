# Phase 2: SQLite Message Store

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Implement ConversationStore with better-sqlite3. Tables: conversations, messages, message_parts. CRUD operations, token counting, ordered retrieval. Migration system for schema versioning.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/context-engine/src/store/conversation-store.ts`
- [ ] `libs/context-engine/src/store/migrations.ts`
- [ ] `libs/context-engine/src/store/index.ts`
- [ ] `libs/context-engine/package.json`

### Verification
- [ ] Messages persist to SQLite and survive process restarts
- [ ] Token count estimated and stored per message
- [ ] Content blocks stored as structured parts
- [ ] Ordered retrieval by conversation with offset/limit
- [ ] Migration system creates tables on first run
- [ ] Unit tests pass for CRUD operations

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
