# Phase 2: Notes Workspace Sync

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Sync NotesWorkspace JSON (tab metadata, tab order, active tab, content as HTML string) via Automerge document. This is workspace-level sync, not character-level rich-text CRDT — the full HTML content string is an LWW field. Rich-text CRDT via @automerge/prosemirror is deferred to Phase 5.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/notes/index.ts`
- [ ] `apps/server/src/services/crdt-sync-service.ts`
- [ ] `libs/crdt/src/documents.ts`

### Verification
- [ ] Notes workspace syncs across instances (tabs, order, content)
- [ ] Tab created on instance A appears on instance B
- [ ] Content updates propagate (last-write-wins at HTML string level)
- [ ] workspaceVersion counter resolves to max across instances

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
