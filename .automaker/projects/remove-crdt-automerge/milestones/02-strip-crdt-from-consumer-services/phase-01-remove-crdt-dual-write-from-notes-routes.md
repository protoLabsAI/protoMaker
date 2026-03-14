# Phase 1: Remove CRDT dual-write from notes routes

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove all CRDT imports and the saveWorkspaceWithCrdt helper from apps/server/src/routes/notes/index.ts. Replace CRDT reads with disk-only reads. Remove the duplicate NotesWorkspaceDocument type definition. All reads and writes go directly to .automaker/notes/workspace.json.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/notes/index.ts`

### Verification
- [ ] No @protolabsai/crdt or @automerge imports in notes/index.ts
- [ ] Notes read/write uses disk path directly
- [ ] Duplicate NotesWorkspaceDocument type removed
- [ ] TypeScript compiles with no errors

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
